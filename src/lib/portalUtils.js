const AUD = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0
});

export function formatCurrency(n) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return AUD.format(Number(n));
}

export function formatPortalDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

export function formatWeekOf(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return (
    "WEEK OF " +
    d
      .toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })
      .toUpperCase()
  );
}

export function relativeDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.round((now - d) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return formatPortalDate(dateStr);
}

export function greetingByHour() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** Build img src for token-gated portal media proxy. */
export function portalMediaUrl(token, photoId) {
  if (!token || !photoId) return "";
  return `/api/portal/media/${photoId}?token=${encodeURIComponent(token)}`;
}
