// Display formatting for takeoff screens (display only — never fed back into a calculation).
export const fmtMm = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString("en-AU") : "—");
export const fmtLm = (n) => (Number.isFinite(n) ? n.toFixed(3) : "—");

/** Plan label without repeating a revision that the upload title already carries. */
export const docLabel = (d) => (!d ? "" : d.revisionLabel && !String(d.title || "").includes(d.revisionLabel) ? `${d.title} — ${d.revisionLabel}` : d.title || "Plan");
