// addressNormalise.mjs — rule-based Australian address normaliser (no external geocoding).
// Phase 1 of the Universal Data Architecture: address is a normalised attribute of the job,
// and `address_normalised` is the canonical match key (replaces fuzzy ilike matching).
//
// Pure function — fully unit-testable. normaliseAddress(raw) -> { normalised, suburb, state, postcode }
//   normalised: lowercase, street abbreviations expanded, punctuation/state/postcode stripped,
//               whitespace collapsed — the stable key for dedup + matching.
//   suburb/state/postcode: best-effort parse of the AU tail ("…, Suburb STATE POSTCODE").

const STREET_ABBR = {
  st: "street", str: "street", rd: "road", ave: "avenue", av: "avenue",
  cres: "crescent", cr: "crescent", crt: "court", ct: "court", cl: "close",
  dr: "drive", drv: "drive", pl: "place", tce: "terrace", ter: "terrace",
  hwy: "highway", pde: "parade", par: "parade", blvd: "boulevard", bvd: "boulevard",
  ln: "lane", gr: "grove", gve: "grove", cct: "circuit", esp: "esplanade",
  sq: "square", row: "row", wy: "way", al: "alley", mews: "mews", rise: "rise",
  n: "north", s: "south", e: "east", w: "west",
};
const STATES = ["sa", "nsw", "vic", "qld", "wa", "tas", "nt", "act"];
const STATE_RE = new RegExp(`\\b(${STATES.join("|")})\\b`, "ig");

export function normaliseAddress(raw) {
  const out = { normalised: null, suburb: null, state: null, postcode: null };
  if (!raw || typeof raw !== "string") return out;
  const s = raw.trim();
  if (!s) return out;

  // Postcode: last 4-digit group in the string (street numbers are at the start, never last).
  const pcMatches = s.match(/\b\d{4}\b/g);
  if (pcMatches && /\b\d{4}\b\s*$/.test(s)) out.postcode = pcMatches[pcMatches.length - 1];

  // State: last state token.
  let sm, lastState = null;
  STATE_RE.lastIndex = 0;
  while ((sm = STATE_RE.exec(s)) !== null) lastState = sm[1];
  if (lastState) out.state = lastState.toUpperCase();

  // Suburb: segment after the last comma, minus state + postcode.
  if (s.includes(",")) {
    const tail = s.split(",").pop().trim();
    const suburb = tail
      .replace(STATE_RE, " ")
      .replace(/\b\d{4}\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (suburb) out.suburb = suburb;
  }

  // Normalised match key: lowercase → strip punctuation → collapse → drop state token →
  // drop trailing postcode → expand street abbreviations.
  let norm = s.toLowerCase()
    .replace(/[.,/#]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(STATE_RE, " ")
    .replace(/\s\d{4}\s*$/, " ")
    .replace(/\s+/g, " ")
    .trim();
  norm = norm.split(" ").filter(Boolean).map((w) => STREET_ABBR[w] || w).join(" ");
  out.normalised = norm || null;

  return out;
}
