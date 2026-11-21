// =============================================================================
// shared/takeoff/centreZones.js — stud centres for a SECTION of one wall (Sam, 22 Nov 2026).
// A wall only partly along a wet area keeps its studs at 450 along that stretch and stays ONE wall (one item on the
// plan, so a cavity slider or any opening can still sit anywhere along it). Saved on the wall's inputs as
//   centreZones: [{ fromMm, toMm, centresMm, from?: "wet" }]   (mm along the traced wall, from its first point)
// "wet" = put there by the wet areas (re-applying them replaces it); absent = made by hand / by joining split pieces.
// The framing: each section is laid out from its own start (one stud stands where the centres change), exactly as a
// wall split at that point would frame. Pure: no DB / DOM / network.
// =============================================================================

export const CENTRE_ZONE_RULE = Object.freeze({ max: 20, minMm: 100, minCentresMm: 100, maxCentresMm: 1200 });

const r1 = (x) => Math.round(x * 10) / 10;

/**
 * Check raw zones (the server's whitelist uses this): { ok:true, zones } sorted, or { ok:false, error }. Never guessed.
 */
export function cleanCentreZones(raw) {
  if (!Array.isArray(raw)) return { ok: false, error: "Centre sections must be a list." };
  if (raw.length > CENTRE_ZONE_RULE.max) return { ok: false, error: `A wall can have ${CENTRE_ZONE_RULE.max} centre sections at most.` };
  const zones = [];
  for (const z of raw) {
    const a = Number(z?.fromMm), b = Number(z?.toMm), c = Number(z?.centresMm);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b - a < CENTRE_ZONE_RULE.minMm) return { ok: false, error: `A centre section needs a start and an end at least ${CENTRE_ZONE_RULE.minMm} mm apart.` };
    if (!(c >= CENTRE_ZONE_RULE.minCentresMm && c <= CENTRE_ZONE_RULE.maxCentresMm)) return { ok: false, error: `Centre section stud centres must be ${CENTRE_ZONE_RULE.minCentresMm} to ${CENTRE_ZONE_RULE.maxCentresMm} mm.` };
    zones.push({ fromMm: r1(a), toMm: r1(b), centresMm: r1(c), ...(z.from === "wet" ? { from: "wet" } : {}) });
  }
  zones.sort((p, q) => p.fromMm - q.fromMm);
  for (let i = 1; i < zones.length; i++) if (zones[i].fromMm < zones[i - 1].toMm - 0.5) return { ok: false, error: "Centre sections on a wall can't overlap." };
  return { ok: true, zones };
}

/** A wall's centre sections, clipped to its length (a section left under the minimum after clipping is dropped). Never throws. */
export function centreZonesOf(inputs, lengthMm = Infinity) {
  const c = cleanCentreZones(Array.isArray(inputs?.centreZones) ? inputs.centreZones : []);
  if (!c.ok) return [];
  return c.zones.map((z) => ({ ...z, fromMm: Math.max(0, z.fromMm), toMm: Math.min(lengthMm, z.toMm) })).filter((z) => z.toMm - z.fromMm >= CENTRE_ZONE_RULE.minMm - 0.5);
}

/** inputs with centreZones set to `zones` (the key removed when there are none). */
export function withCentreZones(inputs, zones) {
  const rest = { ...(inputs || {}) };
  delete rest.centreZones;
  return zones && zones.length ? { ...rest, centreZones: [...zones].sort((p, q) => p.fromMm - q.fromMm) } : rest;
}

/**
 * The wet areas' sections on a wall: its hand sections stay; the old wet sections go; each wet stretch [from, to] becomes a
 * 450 section unless it overlaps a hand section (that wall is the crew's call). Returns the new inputs.
 */
export function withWetZones(inputs, wetMm, centresMm = 450) {
  const hand = centreZonesOf(inputs).filter((z) => z.from !== "wet");
  const wet = (wetMm || []).map(([a, b]) => ({ fromMm: r1(a), toMm: r1(b), centresMm, from: "wet" }))
    .filter((z) => z.toMm - z.fromMm >= CENTRE_ZONE_RULE.minMm && !hand.some((h) => z.fromMm < h.toMm - 0.5 && z.toMm > h.fromMm + 0.5));
  return withCentreZones(inputs, [...hand, ...wet]);
}

/** Does this wall have wet-area sections? */
export const hasWetZones = (inputs) => centreZonesOf(inputs).some((z) => z.from === "wet");

/**
 * The stud stations along a run of `runMm` with sections: [{ fromMm, toMm, centresMm }] (in the run's own mm), the rest at
 * `baseCentresMm`. The first section keeps the run's own layout (`basePositions`, e.g. an offset carried over a split join) up to
 * where the first section starts; every section after is laid out from its own start, with a stud at each change of centres.
 * keepEnd false leaves the run's end stud off (it is counted elsewhere). Positions sorted, de-duplicated (0.5 mm).
 */
export function zonedStations({ runMm, baseCentresMm, zones, basePositions, keepEnd = true, keepStart = true }) {
  const L = runMm;
  const zs = (zones || []).map((z) => ({ a: Math.max(0, z.fromMm), b: Math.min(L, z.toMm), c: z.centresMm })).filter((z) => z.b - z.a > 1).sort((p, q) => p.a - q.a);
  if (!zs.length) return basePositions;
  // the sections covering the whole run
  const secs = [];
  let at = 0;
  for (const z of zs) {
    if (z.a > at + 1) secs.push({ a: at, b: z.a, c: baseCentresMm, base: true });
    secs.push({ a: Math.max(at, z.a), b: z.b, c: z.c });
    at = z.b;
  }
  if (L - at > 1) secs.push({ a: at, b: L, c: baseCentresMm, base: true });
  const out = [];
  secs.forEach((s, i) => {
    if (i === 0 && s.base) out.push(...basePositions.filter((x) => x < s.b - 0.5));
    else {
      if (i > 0 || keepStart) out.push(s.a);
      for (let x = s.a + s.c; x < s.b - 0.5; x += s.c) out.push(r1(x));
    }
    if (i < secs.length - 1) out.push(s.b);   // the stud where the centres change
  });
  if (keepEnd) out.push(L);
  const sorted = out.map(r1).sort((p, q) => p - q);
  return sorted.filter((x, i) => i === 0 || x - sorted[i - 1] > 0.5);
}
