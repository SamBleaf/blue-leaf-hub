// Display formatting for takeoff screens (display only — never fed back into a calculation).
export const fmtMm = (n) => (Number.isFinite(n) ? n.toLocaleString("en-AU", { maximumFractionDigits: 2 }) : "—");
/** A raw measured length: 0.1 mm, so "measured + allowance → order" always adds up. */
export const fmtRaw = (n) => (Number.isFinite(n) ? (Math.round(n * 10) / 10).toLocaleString("en-AU", { maximumFractionDigits: 1 }) : "—");
export const fmtLm = (n) => (Number.isFinite(n) ? n.toFixed(3) : "—");
/** An area in m², two decimals ("12.00"), the same way the wall's elevation shows it. */
export const fmtM2 = (n) => (Number.isFinite(n) ? n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—");

/** Plan label without repeating a revision that the upload title already carries. */
export const docLabel = (d) => (!d ? "" : d.revisionLabel && !String(d.title || "").includes(d.revisionLabel) ? `${d.title} — ${d.revisionLabel}` : d.title || "Plan");
