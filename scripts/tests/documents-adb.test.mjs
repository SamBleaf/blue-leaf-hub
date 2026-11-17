/**
 * documents-adb.test.mjs — the Architect Design Brief (BLB-ADB, template adb-2.0: the brief model), on the anonymised REAL
 * job (scripts/documents/fixtures/real-extension-job.mjs) and the fictional projects (register-projects.mjs), through the
 * real fixture builder, payload, pre-issue checks and renderer. REGISTER_SCREENS_SPEC.md S5–S6. No database, no network.
 * The brief model's own rules are tested in register-brief-model.test.mjs.
 *
 *   node scripts/tests/documents-adb.test.mjs
 */
import fs from "fs";
import os from "os";
import { join } from "path";
import { execFileSync } from "child_process";
import PizZip from "pizzip";
import { buildRegisterFixture, renderRegisterDocument, registerDocChecks, registerItemVersions, versionsDiffer } from "../../server/lib/registerDocuments.mjs";
import { releaseBlockers } from "../../src/lib/registerQuality.js";
import { buildArchitectBriefPayload, DOC_DEFS, validateFixture } from "../../server/lib/documents/documentPayloads.mjs";
import { makeItem, emptyMeta } from "../../src/lib/register.js";
import { realJob } from "../documents/fixtures/real-extension-job.mjs";
import { REGISTER_PROJECTS, designCoordination } from "../documents/fixtures/register-projects.mjs";

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail ? `\n    ${String(detail).slice(0, 700)}` : ""}`); } };
const section = (t) => console.log(`\n${t}`);
const flat = (o) => JSON.stringify(o);
const rows = (pl, key) => [...pl[`${key}_KEEP`], ...pl[key], ...pl[`${key}_PEN`], ...pl[`${key}_LAST`]];
const ISSUED = { status: "Issued", issuedDate: "2026-11-17", revision: 1, issuer: "Sam Morris, Blue Leaf Building" };
const DRAFT = { status: "Draft", issuedDate: "2026-11-17", revision: 1, issuer: "Sam Morris, Blue Leaf Building" };
/** The real job, as the server loads it, with an optional change. */
const real = (tweak) => { const j = realJob(); tweak?.(j); return { lead: j.lead, context: j.context, register: { meta: emptyMeta(j.register.meta), items: j.register.items.map((i) => makeItem(i)) } }; };
const fxOf = (input, more = {}) => buildRegisterFixture("architect_brief", { ...input, ...DRAFT, ...more });
const checksOf = (input, recipientName = "") => registerDocChecks("architect_brief", fxOf(input, { ...ISSUED, recipientName }), { register: input.register, recipientName, mode: "issue" });
/** Every room gets a finished room brief, the architect is named and the benchtop is no longer stone: the job can issue. */
const fixed = (j) => {
  for (const r of j.register.meta.rooms) j.register.items = j.register.items.filter((i) => !(i.roomId === r.id && i.promptKey === "R-004"));
  for (const r of j.register.meta.rooms) j.register.items.push({ id: `b_${r.id}`, kind: "item", promptKey: "R-004", itemKind: "requirement", section: "room", roomId: r.id, category: "layout", description: r.roomType === "wc" ? "Standard WC; no special requirements." : `What the ${r.name.toLowerCase()} must do`, sync: { version: "v1" } });
  const bench = j.register.items.find((i) => i.id === "i38"); bench.answer.selected = []; bench.answer.state = "unresolved";
  j.context.consultants = [{ role: "architect", name: "Jo Bright", company: "Bright Studio", status: "active" }];
};

const job = real();
const draft = fxOf(job), pay = buildArchitectBriefPayload(draft);

section("The real job: payload (adb-2.0)");
ok("the fixture is the brief model, with its printed lines and the records that don't print", draft.architectBrief.model === "adb-2.0" && draft.architectBrief.lines.length === 36 && draft.architectBrief.notPrinted.length === 24);
ok("six sections possible; this job prints five, numbered 01–05", [pay.S1_NUM, pay.S2_NUM, pay.S3_NUM, pay.S4_NUM, pay.S5_NUM].join() === "01,02,03,04,05" && pay.HAS_S6 === false);
ok("the cover: prepared for the design team (no architect yet), the client, the basis, the project", pay.META_ROWS.some((r) => r.VA === "The design team") && pay.META_ROWS.some((r) => r.VB === "DA rev 3")
  && pay.META_ROWS.some((r) => r.VA === "Extension · Construction management"), flat(pay.META_ROWS));
ok("S6: the header band names the suburb; 'Prepared by' is the business, whoever issues it", pay.HDR_PROJECT === "Seaview Park" && pay.META_ROWS.some((r) => r.LA === "Prepared by" && r.VA === "Blue Leaf Building")
  && !flat(pay.META_ROWS).includes("Sam Morris"), flat({ hdr: pay.HDR_PROJECT, meta: pay.META_ROWS }));
ok("S6 line 2 and D4: 'material still to be chosen', and one parenthesis", rows(pay, "POINTS")[1].TEXT === "Kitchen benchtop: material still to be chosen; designer to confirm."
  && /\(agreed with the client; for consultant review\)\.$/.test(rows(pay, "POINTS")[2].TEXT), rows(pay, "POINTS")[2].TEXT);
ok("03 prints No. | What's needed | Who (no By column yet)", pay.NO_BY && !pay.HAS_BY && rows(pay, "POINTS").length === 7 && rows(pay, "POINTS")[0].N === "1" && rows(pay, "POINTS")[6].WHO === "To be agreed");
ok("04: the Laundry's open point prints in its room row with Who", rows(pay.FLOORS[0], "RROWS").some((r) => r.ROOM === "Laundry" && /Open: Washer \/ dryer layout: still to be decided\. Who: To be agreed\./.test(r.TEXT)));
ok("04: 'Brief to follow.' only in a draft, in its own grey run", rows({ ...pay.FLOORS[0] }, "RROWS")[0].PRE === "Brief to follow. " && rows(buildArchitectBriefPayload(fxOf(job, ISSUED)).FLOORS[0], "RROWS").every((r) => r.PRE === ""));
ok("04: no floor label while every room is on one floor", pay.FLOORS.length === 1 && pay.FLOORS[0].HAS_FLOOR === false);
ok("the status box says what the brief is and isn't, and what grey means in a draft", /doesn't approve a technical solution/.test(pay.STATUS_BODY) && /Grey text marks what Blue Leaf still has to provide/.test(pay.STATUS_BODY)
  && !/Grey text/.test(buildArchitectBriefPayload(fxOf(job, ISSUED)).STATUS_BODY));
ok("validateFixture passes the draft", validateFixture(draft, { mode: "draft" }).warnings.length === 0, flat(validateFixture(draft, { mode: "draft" })));

section("The real job: release blockers, with what fixes each (S5 'Can't issue yet')");
const c = checksOf(job);
ok("three red items, as S5: the engineered-stone benchtop, 15 rooms without a brief, who it's going to", c.errors.length === 3 && c.errors[0] === "Kitchen benchtop names engineered stone. It can't be supplied or installed in Australia — agree another benchtop with the client and change the record."
  && /^15 new or renovated rooms have no room brief/.test(c.errors[1]) && /Say who it's going to/.test(c.errors[2]), flat(c.errors));
ok("each red item has its target; the stone's carries the full guidance for the drawer", c.errorTargets.length === 3 && c.errorTargets[0].targets[0].id === "i38" && /in a selection that will be supplied/.test(c.errorTargets[0].targets[0].help)
  && c.errorTargets[1].targets.length === 15 && c.errorTargets[2].targets[0].kind === "architect", flat(c.errorTargets));
ok("the browser's count is the server's: releaseBlockers gives the same three lines (N2)", flat(releaseBlockers("architect_brief", job.register, { recipientName: "", drawingBasis: draft.project.drawingBasis }).map((b) => b.text)) === flat(c.errors));
const noBasis = real((j) => { j.register.meta.planRev = ""; });
ok("the drawing-basis blocker points to The project", checksOf(noBasis).errors.includes("Record the current drawing set / revision on The project before issuing.") && checksOf(noBasis).errorTargets.some((e) => e.targets[0].key === "planRev"));
ok("no false 'wording addressed to the client' warning (the template's own wording isn't read)", !c.warnings.some((w) => /addressed to the client/.test(w)), flat(c.warnings));
const ready = real(fixed);
ok("with a brief in every room, an architect named and the benchtop reworded, it can issue", checksOf(ready, "Jo Bright").errors.length === 0, flat(checksOf(ready, "Jo Bright").errors));
const you = real((j) => { fixed(j); j.register.items.find((i) => i.id === "b_kt").description = "Your kitchen must seat six"; });
ok("wording addressed to the client in the brief's own rows still warns", checksOf(you, "Jo Bright").warnings.some((w) => /addressed to the client/.test(w)));

section("Budget (owner decision 1): the one line that may hold dollars");
const band = real((j) => { fixed(j); Object.assign(j.context.budget, { min: 800000, max: 1000000, confirmed: true }); });
const bandFx = fxOf(band, { ...ISSUED, recipientName: "Jo Bright" });
ok("a confirmed band prints in 01 and doesn't trip the money check", bandFx.architectBrief.project.find((r) => r.key === "budget").text === "$800k–$1m construction budget, ex GST (the client's figure)."
  && checksOf(band, "Jo Bright").errors.length === 0, flat(checksOf(band, "Jo Bright").errors));
const leak = real((j) => { fixed(j); Object.assign(j.context.budget, { min: 800000, max: 1000000, confirmed: true }); j.register.items.find((i) => i.id === "b_kt").description = "Kitchen allowance $45,000"; });
ok("any other dollar figure still blocks issue", checksOf(leak, "Jo Bright").errors.some((e) => /dollar figure/.test(e)));
ok("…with a Fix that opens the record it came from (N15)", flat(checksOf(leak, "Jo Bright").errorTargets.find((e) => /dollar figure/.test(e.text))?.targets) === flat([{ kind: "record", id: "b_kt" }]), flat(checksOf(leak, "Jo Bright").errorTargets));
const unconfirmed = real((j) => { fixed(j); Object.assign(j.context.budget, { min: 800000, max: 1000000, confirmed: false }); });
ok("an unconfirmed band reads 'To be confirmed by Blue Leaf'", fxOf(unconfirmed).architectBrief.project.find((r) => r.key === "budget").text === "To be confirmed by Blue Leaf.");

section("The issue fingerprint (rooms and printed facts, not only records)");
const v0 = registerItemVersions(job.register, job.context);
const moved = real((j) => { j.register.meta.rooms[0].level = "Upper"; });
const vision = real((j) => { j.context.goals.vision = "Light everywhere"; });
ok("a room moved to another floor changes it", registerItemVersions(moved.register, moved.context).__rooms !== v0.__rooms);
ok("a vision recorded in Sales changes it", registerItemVersions(vision.register, vision.context).__facts !== v0.__facts);
ok("a room visit (meta.rev, last room) doesn't", registerItemVersions(real((j) => { j.register.meta.rev = 500; j.register.meta.lastRoomId = "kt"; }).register, job.context).__rooms === v0.__rooms);
const retyped = real((j) => { j.register.meta.rooms.find((r) => r.id === "pn").roomType = "kitchen"; });
ok("a room type changed elsewhere changes it (N23)", versionsDiffer(v0, registerItemVersions(retyped.register, retyped.context)));
const unconfirmed2 = real((j) => { j.register.meta.rooms.find((r) => r.id === "kt").defaultConfirmations = {}; });
ok("…and so does a house default confirmed or cleared for a room", versionsDiffer(v0, registerItemVersions(unconfirmed2.register, unconfirmed2.context)));

section("The fictional projects still build and issue once their rooms have briefs");
for (const name of ["kestrel", "ridgeline", "powder"]) {
  const p = REGISTER_PROJECTS[name]();
  if (name === "kestrel") designCoordination(p);
  for (const r of p.register.meta.rooms) p.register.items.push(makeItem({ id: `brief_${r.id}`, promptKey: "R-004", itemKind: "requirement", section: "room", roomId: r.id, category: "layout", description: `What the ${r.name.toLowerCase()} must do` }));
  const input = { lead: p.lead, context: p.context, register: p.register, projectRef: p.projectRef };
  const errs = registerDocChecks("architect_brief", buildRegisterFixture("architect_brief", { ...input, ...ISSUED, recipientName: "Mara Ellison" }), { register: p.register, recipientName: "Mara Ellison", mode: "issue" }).errors;
  ok(`${name}: no release blockers`, errs.length === 0, flat(errs));
}

section("Template (adb-2.0) and rendering through LibreOffice");
const tpl = new PizZip(fs.readFileSync(join(process.cwd(), "public/templates", DOC_DEFS.architect_brief.templateFile))).file("word/document.xml").asText().replace(/<[^>]+>/g, "");
ok("the template carries every section and the placeholder run", ["{#HAS_S1}", "{#HAS_S2}", "{#HAS_S3}", "{#HAS_BY}", "{#NO_BY}", "{#FLOORS}", "{PRE}", "{#HAS_S5}", "{#HAS_S6}"].every((t) => tpl.includes(t)), tpl.slice(0, 300));
const text = (pdf) => { try { return execFileSync("pdftotext", [pdf, "-"], { encoding: "utf8" }); } catch { return null; } };
const pages = (pdf) => { try { return Number(execFileSync("pdfinfo", [pdf], { encoding: "utf8" }).match(/Pages:\s+(\d+)/)[1]); } catch { return 0; } };
const tmp = fs.mkdtempSync(join(os.tmpdir(), "adb2-"));
for (const [name, input, more] of [["real job draft", job, DRAFT], ["real job, ready to issue", ready, { ...ISSUED, recipientName: "Jo Bright" }]]) {
  const fx = fxOf(input, more);
  const out = await renderRegisterDocument("architect_brief", fx, {});
  const f = join(tmp, `${name.replace(/\W+/g, "-")}.pdf`); fs.writeFileSync(f, out.pdf);
  const n = pages(f), t = text(f) || "";
  ok(`${name}: 2 to 3 pages, no leaks, Lato only`, n >= 2 && n <= 3 && out.leaks.length === 0 && out.fonts.every((x) => /^Lato-/.test(x)), `pages ${n} leaks ${out.leaks} fonts ${out.fonts}`);
  ok(`${name}: reads as the brief model says (03 numbered, rooms, selections)`, /Needed for the next drawing issue/.test(t) && /Retaining and pool: are they part of this job\?/.test(t) && /Selections that affect the drawings/.test(t) && !/engineered stone/i.test(t));
  ok(`${name}: ${more.status === "Draft" ? "grey 'Brief to follow.' in rooms" : "no 'Brief to follow.' anywhere"}`, more.status === "Draft" ? /Brief to follow\./.test(t) : !/Brief to follow/.test(t));
}
fs.rmSync(tmp, { recursive: true, force: true });

console.log(`\ndocuments-adb: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
