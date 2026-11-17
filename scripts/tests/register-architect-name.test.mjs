/**
 * register-architect-name.test.mjs — one architect, one place (owner decision 6; "Change it everywhere?", 17 Nov 2026).
 * Pure: the flag (server/lib/architectNameSync.mjs) and the question (src/lib/architectNameAsk.js). No database, no network.
 *
 *   node scripts/tests/register-architect-name.test.mjs
 */
import { architectNameFlag, architectLabels, sameArchitectName, loadArchitectFlag } from "../../server/lib/architectNameSync.mjs";
import { settleArchitectName, changeEverywhereQuestion } from "../../src/lib/architectNameAsk.js";

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail ? `\n    ${String(detail).slice(0, 500)}` : ""}`); } };
const section = (t) => console.log(`\n${t}`);

const team = [
  { role: "engineer", name: "Ed Gray", company: "Gray Structures", roleId: "r9", contactId: "c9", status: "active" },
  { role: "architect", name: "Jane Smith", company: "Studio X Architects Pty Ltd", roleId: "r1", contactId: "c1", status: "active" },
];

section("Which typed names are the same architect");
ok("the firm, the person, 'Person, Firm' and the firm with Pty Ltd dropped all match", ["Studio X Architects", "studio x architects pty ltd", "Jane Smith", "Jane Smith, Studio X Architects Pty Ltd", "Studio X Architects (Jane Smith)"]
  .every((n) => architectLabels(team[1]).some((l) => sameArchitectName(l, n))));
ok("a different practice doesn't", !architectLabels(team[1]).some((l) => sameArchitectName(l, "Studio Y Architects")));
ok("blank never matches", !sameArchitectName("", ""));

section("The flag");
ok("the same architect: nothing to ask", architectNameFlag(team, "Studio X Architects") === null);
ok("nothing typed: nothing to ask", architectNameFlag(team, "  ") === null && architectNameFlag(team, null) === null);
ok("no architect on the design team yet: nothing to ask (the name stays 'Noted in Sales')", architectNameFlag([team[0]], "Studio Y") === null && architectNameFlag([], "Studio Y") === null);
const f = architectNameFlag(team, "Studio Y Architects");
ok("a different architect: flagged with the current one and the role row to replace", f && f.current === "Studio X Architects Pty Ltd" && f.proposed === "Studio Y Architects" && f.roleId === "r1" && f.contactId === "c1" && f.role === "architect", JSON.stringify(f));
ok("a finished or inactive architect isn't the current one", architectNameFlag([{ ...team[1], status: "completed" }], "Studio Y") === null);
ok("a designer counts as the architect when there is no architect", architectNameFlag([{ role: "designer", name: "Dee", company: "Dee Design", roleId: "r2", contactId: "c2", status: "active" }], "Other Design")?.role === "designer");

section("The question and the answer");
ok("the question says who is on the team, what was typed, and asks 'Change it everywhere?'", /Studio X Architects Pty Ltd/.test(changeEverywhereQuestion({ ...f })) && /Studio Y Architects/.test(changeEverywhereQuestion(f)) && /Change it everywhere\?/.test(changeEverywhereQuestion(f)));
{
  const calls = [];
  const post = async (url, body) => { calls.push([url, body]); return { ok: true }; };
  const yes = await settleArchitectName({ ...f, leadId: "L1" }, { ask: () => true, post });
  ok("yes: one design-team save for that lead, naming the new architect and replacing the current one", yes.changed && calls.length === 1 && calls[0][0] === "/api/sales/leads/L1/design-team"
    && calls[0][1].name === "Studio Y Architects" && calls[0][1].role === "architect" && calls[0][1].replaces.roleId === "r1" && calls[0][1].replaces.contactId === "c1", JSON.stringify(calls));
  calls.length = 0;
  const no = await settleArchitectName({ ...f, leadId: "L1" }, { ask: () => false, post });
  ok("no: nothing is saved", no.asked && !no.changed && calls.length === 0);
  const none = await settleArchitectName(null, { ask: () => true, post });
  ok("no flag: nothing is asked", !none.asked && calls.length === 0);
  const bad = await settleArchitectName({ ...f, leadId: "L1" }, { ask: () => true, post: async () => ({ ok: false, error: "Nope." }) });
  ok("a failed save says so and changes nothing", !bad.changed && bad.error === "Nope.");
}

section("From the database (a fake client)");
{
  const sb = { from: (t) => ({ select: () => ({ eq: () => ({ limit: () => ({ maybeSingle: async () => ({ data: t === "leads" ? null : null }) }) }) }) }) };
  const r = await loadArchitectFlag(sb, { jobId: "J1" }, "Studio Y");
  ok("a job with no lead has nothing to ask", r.flag === null && r.leadId === null);
}

console.log(`\nregister-architect-name: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
