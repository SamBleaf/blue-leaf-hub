// Server-side shared constants. Mirrors the GST helpers in src/lib/constants.js so server
// routes never hardcode 0.1 / *1.1 (CLAUDE.md standard) and share one source of truth.
export const GST_RATE = 0.10;

/** GST component of an ex-GST amount, rounded to cents. */
export const gstAmount = (exGstAmt) => Math.round(Number(exGstAmt) * GST_RATE * 100) / 100;

/** Inc-GST total from an ex-GST amount, rounded to cents. */
export const incGst = (exGstAmt) => Math.round(Number(exGstAmt) * (1 + GST_RATE) * 100) / 100;
