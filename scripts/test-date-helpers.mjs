// Regression tests for AU-local date helpers (dateYmd.mjs).
// These guard the week-boundary / "today" math that drives timesheet completion
// and (downstream) payroll — an off-by-one here silently corrupts pay.
// Run: node scripts/test-date-helpers.mjs
import { mondayOf, todayYmd, addDaysYmd } from "../server/lib/dateYmd.mjs";

let pass = 0, fail = 0;
const eq = (a, b, msg) => {
  if (a === b) { pass++; }
  else { fail++; console.log("FAIL:", msg, "got", JSON.stringify(a), "want", JSON.stringify(b)); }
};

eq(mondayOf("2026-06-21"), "2026-06-15", "Sunday → previous Monday");
eq(mondayOf("2026-06-15"), "2026-06-15", "Monday → itself");
eq(mondayOf("2026-06-17"), "2026-06-15", "Wednesday → Monday");
eq(mondayOf("2026-06-20"), "2026-06-15", "Saturday → Monday");
eq(mondayOf("2026-07-01"), "2026-06-29", "week crossing month boundary");
eq(addDaysYmd("2026-07-01", -1), "2026-06-30", "addDaysYmd -1 across month");
eq(/^\d{4}-\d{2}-\d{2}$/.test(todayYmd()), true, "todayYmd format");
// Brisbane (UTC+10) is never behind UTC — the off-by-one we are fixing.
eq(todayYmd() >= new Date().toISOString().slice(0, 10), true, "AU today not behind UTC");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
