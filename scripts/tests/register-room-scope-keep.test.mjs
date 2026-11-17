/**
 * register-room-scope-keep.test.mjs — step 1 of the two-step "Altered" release (owner decision 4, 17 Nov 2026): a room
 * scope this release doesn't know is kept through read, write and save, so an older open screen can't turn a newer
 * release's "altered" into "new" and save it back. No database, no network.
 */
import { makeRoom, emptyMeta, writeRegister, readRegister } from "../../src/lib/register.js";
let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };
ok("an unknown scope word is kept", makeRoom({ scope: "altered" }).scope === "altered");
ok("a known scope is unchanged", makeRoom({ scope: "renovated" }).scope === "renovated");
ok("blank or malformed still defaults to new", makeRoom({ scope: "" }).scope === "new" && makeRoom({ scope: "Bad Value" }).scope === "new" && makeRoom({}).scope === "new");
const round = readRegister({ selections_schedule: writeRegister({ meta: emptyMeta({ rooms: [{ id: "r1", name: "Entry", scope: "altered" }] }), items: [] }) }).meta.rooms[0].scope;
ok("it survives the lead scratchpad's write and read", round === "altered");
console.log(`\nregister-room-scope-keep: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
