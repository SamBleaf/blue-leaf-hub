// Client-facing finance emails (progress claims + variations).
// Each builder returns { subject, text, html } — text is the plain-text fallback,
// html is the branded version (replaces the old <pre> blocks in financeCCRoutes).

import { emailShell, detailTable, paymentBlock, esc } from "./layout.mjs";

const fmtAud = (n) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(Number(n) || 0);

// Never hardcode 0.1 / *1.1 inline (repo Law) — derive from the rate.
const GST_RATE = 0.10;
const gstAmount = (exGst) => Number(exGst || 0) * GST_RATE;
const incGst = (exGst) => Number(exGst || 0) * (1 + GST_RATE);

const BRAND_INK = "#2B2B2B";

function paragraph(text) {
  return `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:${BRAND_INK}">${text}</p>`;
}

/**
 * @param {{ claim:object, job:object, stageLabel:string, dueDate:string, bank?:object, pixelUrl?:string }} opts
 */
export function progressClaimEmail({ claim, job, stageLabel, dueDate, bank, pixelUrl }) {
  const amountEx = Number(claim.amount_ex_gst || 0);
  const gst = gstAmount(amountEx);
  const incTotal = incGst(amountEx);
  const address = job.address || "";
  const subject = `Progress Claim ${claim.claim_number} — ${address}`;

  const text = [
    `Please find attached Progress Claim ${claim.claim_number} for ${address}.`,
    ``,
    `Stage: ${stageLabel}`,
    `Amount (ex GST): ${fmtAud(amountEx)}`,
    `GST: ${fmtAud(gst)}`,
    `Total (inc GST): ${fmtAud(incTotal)}`,
    `Payment due: ${dueDate}`,
    ...(bank && (bank.bsb || bank.accountNumber)
      ? [``, `Payment details:`,
         ...(bank.accountName ? [`  Account name: ${bank.accountName}`] : []),
         ...(bank.bsb ? [`  BSB: ${bank.bsb}`] : []),
         ...(bank.accountNumber ? [`  Account number: ${bank.accountNumber}`] : [])]
      : []),
    ``,
    `Please direct all payment enquiries to accounts@blueleafbuilding.com.au.`,
    ``,
    `Blue Leaf Building`,
  ].join("\n");

  const bodyHtml = `
    <h1 style="margin:0 0 16px;font-size:20px;color:${BRAND_INK}">Progress Claim ${esc(claim.claim_number)}</h1>
    ${paragraph(`Please find attached Progress Claim <strong>${esc(claim.claim_number)}</strong> for <strong>${esc(address)}</strong>. The PDF is attached to this email.`)}
    ${detailTable([
      ["Stage", stageLabel],
      ["Amount (ex GST)", fmtAud(amountEx)],
      ["GST", fmtAud(gst)],
      ["Total (inc GST)", fmtAud(incTotal), { strong: true }],
      ["Payment due", dueDate],
    ])}
    ${paymentBlock(bank)}
    ${paragraph(`If you have any questions about this claim, please reply to this email or contact <a href="mailto:accounts@blueleafbuilding.com.au" style="color:#006C9B">accounts@blueleafbuilding.com.au</a>.`)}
    ${paragraph(`Thank you,<br>Blue Leaf Building`)}
  `;

  return { subject, text, html: emailShell({ title: subject, bodyHtml, pixelUrl }) };
}

/**
 * @param {{ variation:object, job:object, pixelUrl?:string }} opts
 */
export function variationEmail({ variation, job, pixelUrl }) {
  const amountEx = Number(variation.amount_ex_gst || 0);
  const gst = gstAmount(amountEx);
  const incTotal = incGst(amountEx);
  const address = job.address || "";
  const subject = `Variation ${variation.variation_number} — ${address}`;

  const text = [
    `Please find attached Variation ${variation.variation_number} for ${address}.`,
    ``,
    `Title: ${variation.title}`,
    ...(variation.description ? [`Description: ${variation.description}`, ``] : [``]),
    `Amount (ex GST): ${fmtAud(amountEx)}`,
    `GST: ${fmtAud(gst)}`,
    `Total (inc GST): ${fmtAud(incTotal)}`,
    ...(variation.eot_days ? [`Extension of time: ${variation.eot_days} days`, ``] : [``]),
    `To approve this variation, please reply to this email or contact us at accounts@blueleafbuilding.com.au.`,
    ``,
    `Blue Leaf Building`,
  ].join("\n");

  const bodyHtml = `
    <h1 style="margin:0 0 16px;font-size:20px;color:${BRAND_INK}">Variation ${esc(variation.variation_number)}</h1>
    ${paragraph(`Please find attached Variation <strong>${esc(variation.variation_number)}</strong> for <strong>${esc(address)}</strong>. The PDF is attached to this email.`)}
    ${detailTable([
      ["Title", variation.title],
      variation.description ? ["Description", variation.description] : null,
      ["Amount (ex GST)", fmtAud(amountEx)],
      ["GST", fmtAud(gst)],
      ["Total (inc GST)", fmtAud(incTotal), { strong: true }],
      variation.eot_days ? ["Extension of time", `${variation.eot_days} days`] : null,
    ].filter(Boolean))}
    ${paragraph(`To approve this variation, please reply to this email or contact <a href="mailto:accounts@blueleafbuilding.com.au" style="color:#006C9B">accounts@blueleafbuilding.com.au</a>.`)}
    ${paragraph(`Thank you,<br>Blue Leaf Building`)}
  `;

  return { subject, text, html: emailShell({ title: subject, bodyHtml, pixelUrl }) };
}
