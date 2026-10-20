// =============================================================================
// orderedId.js — a time-ordered id for client-made records whose ORDER matters (wall-by-wall step 5).
//
// The server sorts measurements by save time, then by id (takeoffService.mjs loadSnapshot). Records saved together
// (a run traced offline, two quick runs inside one autosave) share ONE save time, so their id decides the order.
// A random id would put Run 2 before Run 1 at random; this id starts with the time it was made (UUID version 7
// layout: 48-bit milliseconds, then a counter, then random bits), so ids made later always sort later — on this
// device, in this session — and the walls come back in the order they were traced, on every load.
// It is still a valid UUID (the server checks the shape only) and as unique as a random one for idempotent saves.
// =============================================================================

let lastMs = 0;
let counter = 0;

/** A UUID (version 7 layout) that sorts after every id made before it on this device. */
export function orderedId() {
  const b = new Uint8Array(16);
  globalThis.crypto.getRandomValues(b);
  let ms = Date.now();
  if (ms > lastMs) { lastMs = ms; counter = 0; }
  else {
    // the same millisecond (or the clock stepped back): keep the last time and count on, so the order holds
    ms = lastMs;
    counter += 1;
    if (counter > 0xfff) { lastMs += 1; ms = lastMs; counter = 0; }
  }
  for (let i = 5; i >= 0; i--) { b[i] = ms % 256; ms = Math.floor(ms / 256); }
  b[6] = 0x70 | ((counter >> 8) & 0x0f);
  b[7] = counter & 0xff;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
