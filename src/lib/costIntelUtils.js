/** Normalize trade label for grouping */
export function normalizeTradeKey(trade) {
  return String(trade || "")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

export const TRADE_CHART_COLORS = {
  metal_roofing: "#1f2937",
  tiling: "#0f766e",
  electrical: "#b45309",
  plumbing: "#0e7490",
  excavation: "#92400e",
  default: "#006c9b"
};

export function tradeChartColor(key) {
  return TRADE_CHART_COLORS[key] || TRADE_CHART_COLORS.default;
}

export function effectiveRatePerM2(row) {
  const q = Number(row.quote_amount);
  if (!Number.isFinite(q) || q <= 0) return null;
  const t = normalizeTradeKey(row.trade);
  const floor = Number(row.floor_area_m2);
  const roof = Number(row.roof_area_m2);
  const tileF = Number(row.tile_area_floor_m2);
  const tileW = Number(row.tile_area_wall_m2);
  const solar = Number(row.solar_system_kw);

  if (t.includes("roof") && roof > 0) return q / roof;
  if (t.includes("tile")) {
    const denom = (floor > 0 ? floor : 0) + (tileF > 0 ? tileF : 0) + (tileW > 0 ? tileW : 0);
    if (denom > 0) return q / denom;
  }
  if (t.includes("electrical") && solar > 0 && floor > 0) return q / (floor + solar * 8);
  if (t.includes("plumb") && Number(row.wet_areas) > 0 && floor > 0) {
    return q / (floor + Number(row.wet_areas) * 12);
  }
  if (floor > 0) return q / floor;
  return null;
}

/** @param {{ rate: number, recorded_at?: string }[]} quotes sorted oldest first */
export function trendFromQuotes(quotes) {
  const rates = quotes.map((q) => q.rate).filter((r) => Number.isFinite(r) && r > 0);
  if (rates.length < 2) return "—";
  const last3 = rates.slice(-3);
  const prev3 = rates.slice(-6, -3);
  if (prev3.length === 0) return "—";
  const a = last3.reduce((s, x) => s + x, 0) / last3.length;
  const b = prev3.reduce((s, x) => s + x, 0) / prev3.length;
  if (Math.abs(a - b) / b < 0.02) return "Flat";
  return a > b ? "Up" : "Down";
}

export function formatAud(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n);
}

export function formatAudM2(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${formatAud(n)}/m²`;
}

export function rowsToCsv(rows) {
  const headers = [
    "recorded_at",
    "address",
    "project_type",
    "trade",
    "source",
    "quote_amount",
    "floor_area_m2",
    "roof_area_m2",
    "wall_area_m2",
    "tile_area_floor_m2",
    "tile_area_wall_m2",
    "solar_system_kw",
    "wet_areas",
    "storeys",
    "rate_per_m2_stored",
    "notes"
  ];
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(
      headers
        .map((h) => {
          if (h === "address") return esc(r.jobs?.address);
          if (h === "rate_per_m2_stored") return esc(r.rate_per_m2);
          return esc(r[h]);
        })
        .join(",")
    );
  }
  return lines.join("\n");
}

export function quantitySummaryForRow(row) {
  const t = normalizeTradeKey(row.trade);
  const parts = [];
  if (row.floor_area_m2 != null) parts.push(`Floor ${Number(row.floor_area_m2).toFixed(1)} m²`);
  if (t.includes("roof") && row.roof_area_m2 != null) parts.push(`Roof ${Number(row.roof_area_m2).toFixed(1)} m²`);
  if (t.includes("tile")) {
    if (row.tile_area_floor_m2 != null) parts.push(`Tile floor ${Number(row.tile_area_floor_m2).toFixed(1)} m²`);
    if (row.tile_area_wall_m2 != null) parts.push(`Tile wall ${Number(row.tile_area_wall_m2).toFixed(1)} m²`);
  }
  if (t.includes("electrical") && row.solar_system_kw != null) parts.push(`Solar ${Number(row.solar_system_kw)} kW`);
  if (t.includes("plumb") && row.wet_areas != null) parts.push(`Wet areas ${row.wet_areas}`);
  if (row.storeys != null) parts.push(`Storeys ${row.storeys}`);
  return parts.join(" · ") || "—";
}
