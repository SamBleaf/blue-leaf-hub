/**
 * register-needs-action.test.mjs — "Needs action from…" (REGISTER_SCREENS_SPEC.md S4): the rules in src/lib/needsAction.js,
 * on the anonymised REAL job (scripts/documents/fixtures/real-extension-job.mjs) and on small made-up records, then the
 * real ⚑, PromptRow and Actions list rendered to a string (esbuild, no browser). No database, no network.
 *
 *   node scripts/tests/register-needs-action.test.mjs
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { makeItem, emptyMeta, editOutrunsApproval, itemIssues, questionById } from "../../src/lib/register.js";
import { openPoints, whoOf, architectBriefModel } from "../../src/lib/briefModel.js";
import {
  prefillWhat, suggestedWho, defaultDue, whoChoices, choiceByKey, setActionPatch, donePatch, checkedPatch, clearPatch, undoPatchFor,
  flagState, pillWords, footnoteFor, groupPoints, actionsSummary, copyListText, copiedWords, pointLine, pointTags, pointSubject,
  isOverdue, addedWords, subjectLine, openingView, rowOpensSheet, WHO_CHOICES, PARK_REASON, UNNAMED_GROUP,
  assignPatch, whatToSaveOnClose, actionPoints, FOOTNOTE_ARCHITECT, FOOTNOTE_CLIENT, FOOTNOTE_BLUE_LEAF, FOOTNOTE_OURS,
} from "../../src/lib/needsAction.js";
import { realJob } from "../documents/fixtures/real-extension-job.mjs";
import { buildRegisterFixture } from "../../server/lib/registerDocuments.mjs";

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail ? `\n    ${String(detail).slice(0, 700)}` : ""}`); } };
const section = (t) => console.log(`\n${t}`);
const flat = (o) => JSON.stringify(o);
const load = (tweak) => { const j = realJob(); tweak?.(j); return { ...j, register: { meta: emptyMeta(j.register.meta), items: j.register.items.map((i) => makeItem(i)) } }; };
const { register, context } = load();
const item = (reg, id) => reg.items.find((i) => i.id === id);
const apply = (reg, id, patch) => ({ ...reg, items: reg.items.map((i) => (i.id === id ? makeItem({ ...i, ...patch, sync: i.sync }) : i)) });
const C = (key) => choiceByKey(key, context);
const ids = (pts) => pts.map((p) => p.ids.join("+")).join(",");
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const L002 = (more = {}) => makeItem({ id: "x1", promptKey: "L-002", itemKind: "requirement", roomId: "ld", section: "room", category: "layout", ...more });

section("Prefill: what's needed (S4 prefill rules)");
ok("recorded chips → 'Confirm …' (Gutters)", prefillWhat(register, item(register, "i27")) === "Confirm half round", prefillWhat(register, item(register, "i27")));
ok("recorded words → 'Confirm …' (windows, as typed, tidied)", prefillWhat(register, item(register, "i06")) === "Confirm double glazed aluminium, Jolong, white frames");
ok("a card's choice reads in its own words (main walls)", prefillWhat(register, item(register, "i47")) === "Confirm rendered AAC");
ok("a choice with no answer → 'Decide the …' (washer / dryer layout)", prefillWhat(register, item(register, "i61")) === "Decide the washer / dryer layout");
ok("a question not answered yet → 'Decide the …'", prefillWhat(register, L002()) === "Decide the washer / dryer layout");
ok("an element in or out → 'Decide whether … is part of this job'", prefillWhat(register, item(register, "i71")) === "Decide whether retaining is part of this job");
ok("an action record → its own words", prefillWhat(register, item(register, "i46")) === "Curved micro cement feature rangehood");
ok("a new, empty action → nothing (the Who chips wait for words)", prefillWhat(register, makeItem({ promptKey: "W-025", itemKind: "action" })) === "");
ok("a benchtop held open for engineered stone never names the stone", prefillWhat(register, item(register, "i38")) === "Decide the kitchen benchtop");
const stone = makeItem({ promptKey: "K-005", itemKind: "selection", roomId: "kt", answer: { v: 1, state: "recorded", selected: [{ optionId: "engineered_stone", path: ["engineered_stone"], label: "Engineered stone" }] } });
ok("nor does a benchtop that recorded it", !/engineered stone/i.test(prefillWhat(register, stone)), prefillWhat(register, stone));

section("Suggested who");
ok("the question's coordinator when nobody is named (Gutters → Architect)", suggestedWho(item(register, "i27")) === "architect");
ok("the record's owner first (bedroom floor → Client)", suggestedWho(item(register, "i29")) === "client");
ok("a consultant on an energy question reads Energy assessor", suggestedWho(item(register, "i07")) === "energy");
ok("a consultant with actionRole engineer reads Engineer", suggestedWho(makeItem({ promptKey: "W-016", responsibility: "consultant", actionRole: "engineer" })) === "engineer");
ok("a technical check never suggests the client (HVAC is the client's: the question's owner instead)", suggestedWho(item(register, "i08")) === "trade");
ok("…and with nothing else to go on, nothing is suggested", suggestedWho(makeItem({ promptKey: "W-025", itemKind: "action", responsibility: "client", technicalStatus: "needs_verification" })) === null);
ok("no owner and no coordinator → no suggestion", suggestedWho(item(register, "i61")) === null);

section("By when, and the Who chips");
ok("design team → next drawing issue", ["architect", "engineer", "energy", "trade"].every((k) => defaultDue(k) === "next_issue"));
ok("client and Blue Leaf → next meeting", defaultDue("client") === "next_meeting" && defaultDue("blue_leaf") === "next_meeting" && defaultDue(null) === "");
ok("six chips in the drawn order", whoChoices(context).map((c) => c.label).join(" · ") === "Client · Architect · Engineer · Energy assessor · Blue Leaf · Trade or supplier");
const named = { ...context, consultants: [{ role: "architect", name: "Jo Bright", company: "Bright Studio", status: "active" }] };
ok("once someone is on the design team the chip names them", choiceByKey("architect", named).label === "Architect — Bright Studio" && choiceByKey("architect", named).short === "Architect");
ok("who maps to responsibility, with actionRole only for a consultant",
  flat(WHO_CHOICES.map((c) => [c.key, c.responsibility, c.actionRole])) === flat([["client", "client", ""], ["architect", "architect", ""], ["engineer", "consultant", "engineer"], ["energy", "consultant", "energy"], ["blue_leaf", "blue_leaf", ""], ["trade", "trade", ""]]));

section("Setting an action (one Who tap)");
{
  const g = item(register, "i27");
  const p = setActionPatch(g, C("architect"), { what: prefillWhat(register, g), due: defaultDue("architect") });
  ok("writes who, what, by when, and keeps it open", p.responsibility === "architect" && p.actionRole === "" && p.nextAction === "Confirm half round" && p.actionDue === "next_issue" && p.resolved === false, flat(p));
  ok("an answered record keeps its answer", !("answer" in p));
  const r2 = apply(register, "i27", p);
  ok("the row's pill reads 'Architect · Next issue'", flagState(item(r2, "i27")) === "set" && pillWords(context, item(r2, "i27")) === "Architect · Next issue");
  ok("the point moves from 'No one named yet' to Architect", openPoints(r2, context).find((x) => x.ids[0] === "i27").who.key === "architect");
  ok("and prints with its by-when in the brief's next-issue list", architectBriefModel(r2, context, {}).points.find((x) => x.ids[0] === "i27").by === "Next issue");
  ok("the toast", addedWords(C("architect"), "next_issue") === "Architect · next drawing issue — added to Actions");
  const e = setActionPatch(g, C("engineer"), { what: "Size the box gutter", due: "next_issue" });
  ok("Engineer is a consultant with actionRole engineer, and it survives the store", e.responsibility === "consultant" && e.actionRole === "engineer" && makeItem({ ...g, ...e }).actionRole === "engineer" && whoOf(context, makeItem({ ...g, ...e })).key === "engineer");
  ok("actionRole is dropped for anyone who isn't a consultant", setActionPatch(g, { ...C("client"), actionRole: "engineer" }, { what: "x" }).actionRole === "" && makeItem({ responsibility: "architect", actionRole: "engineer" }).actionRole === "");
  ok("a picked date is kept; anything else isn't", setActionPatch(g, C("client"), { what: "x", due: "2026-11-28" }).actionDue === "2026-11-28" && setActionPatch(g, C("client"), { what: "x", due: "soon" }).actionDue === "");
}

section("Parking a choice with no answer (the matching existing reason)");
{
  const reasons = Object.fromEntries(WHO_CHOICES.map((c) => [c.key, setActionPatch(L002(), c, { what: "Decide the layout" }).answer]));
  ok("Client → decide later", reasons.client?.state === "unresolved" && reasons.client.unresolved?.reason === "decide_later");
  ok("Architect, Engineer, Energy assessor → designer to confirm", ["architect", "engineer", "energy"].every((k) => reasons[k]?.unresolved?.reason === "designer_to_confirm"));
  ok("Blue Leaf → Blue Leaf to advise", reasons.blue_leaf?.unresolved?.reason === "blue_leaf_to_advise");
  ok("Trade or supplier → not decided, with no reason named", reasons.trade?.state === "unresolved" && !reasons.trade.unresolved);
  ok("the map behind it", flat(PARK_REASON) === flat({ client: "decide_later", architect: "designer_to_confirm", engineer: "designer_to_confirm", energy: "designer_to_confirm", blue_leaf: "blue_leaf_to_advise" }));
  ok("answer.v stays 1", Object.values(reasons).every((a) => a.v === 1));
  const zoned = makeItem({ id: "x2", promptKey: "K-006", itemKind: "selection", section: "project", category: "benchtop", answer: { v: 1, zone: { key: "kitchen", label: "Kitchen" }, note: "Ask about tiles", custom: "kept" } });
  const za = setActionPatch(zoned, C("client"), { what: "Decide the kitchen splashback" }).answer;
  ok("other answer keys are kept (zone, note, a key this screen doesn't know)", za?.zone?.key === "kitchen" && za.note === "Ask about tiles" && za.custom === "kept" && za.state === "unresolved", flat(za));
  const i61 = item(register, "i61");
  ok("one already parked with no reason takes the matching one", setActionPatch(i61, C("architect"), { what: "x" }).answer?.unresolved?.reason === "designer_to_confirm");
  ok("re-naming who moves a mapped reason with it (bedroom floor: client → architect)", setActionPatch(item(register, "i29"), C("architect"), { what: "x" }).answer?.unresolved?.reason === "designer_to_confirm");
  const waiting = L002({ answer: { v: 1, state: "unresolved", unresolved: { reason: "awaiting_info" } } });
  ok("a reason that names no one is kept (awaiting drawings / info)", !("answer" in setActionPatch(waiting, C("architect"), { what: "x" })));
  ok("an answered record isn't parked", !("answer" in setActionPatch(item(register, "i47"), C("architect"), { what: "x" })));
  ok("nor an element in or out, nor an action", !("answer" in setActionPatch(item(register, "i71"), C("client"), { what: "x" })) && !("answer" in setActionPatch(item(register, "i46"), C("client"), { what: "x" })));
  const approved = L002({ certainty: "client_approved", evidence: { at: "2026-11-15T10:00:00Z", by: "Sam" } });
  ok("a client-approved record is never parked, so it keeps its approval", !("answer" in setActionPatch(approved, C("architect"), { what: "x" })) && !editOutrunsApproval(approved, setActionPatch(approved, C("architect"), { what: "x" })));
  ok("the real job's client-approved checks keep theirs", ["i07", "i08"].every((id) => !editOutrunsApproval(item(register, id), setActionPatch(item(register, id), C("energy"), { what: "x", due: "next_issue" }))));
  const parked = apply(register, "i61", setActionPatch(i61, C("architect"), { what: "Decide the washer / dryer layout", due: "next_issue" }));
  const p61 = openPoints(parked, context).filter((x) => x.ids.includes("i61"));
  ok("counts stay consistent: still one point, now the architect's", p61.length === 1 && p61[0].who.key === "architect" && openPoints(parked, context).length === 9, flat(p61.map((x) => x.who)));
  const fresh = makeItem({ promptKey: "W-025", itemKind: "action" });
  ok("an action with no words of its own takes the words typed", setActionPatch(fresh, C("architect"), { what: "Confirm the stair position" }).description === "Confirm the stair position");
}

section("A client-approved or locked record keeps its answer (an action isn't a content change)");
{
  const ev = { at: "2026-11-15T10:00:00Z", by: "Sam", method: "meeting" };
  const approvedRecords = [
    ["a choice with no answer", L002({ certainty: "client_approved", evidence: ev })],
    ["one parked with a mapped reason", L002({ certainty: "client_approved", evidence: ev, answer: { v: 1, state: "unresolved", unresolved: { reason: "decide_later" } } })],
    ["one parked with no reason", L002({ certainty: "client_approved", evidence: ev, answer: { v: 1, state: "unresolved" } })],
    ["a portal-approved selection (read back as client-approved)", makeItem({ id: "x3", promptKey: "K-006", itemKind: "selection", roomId: "kt", section: "room", category: "benchtop", certainty: "client_approved", evidence: ev, sync: { table: "client_selections", status: "approved" } })],
  ];
  for (const [name, rec] of approvedRecords) {
    const patches = WHO_CHOICES.map((c) => setActionPatch(rec, c, { what: "Confirm it", due: defaultDue(c.key) }));
    ok(`${name}: no Who tap writes its answer`, patches.every((p) => !("answer" in p)), flat(patches.find((p) => "answer" in p)));
    ok(`${name}: and none outruns the approval`, patches.every((p) => !editOutrunsApproval(rec, p)));
  }
  const appr = approvedRecords[0][1];
  ok("nor do Done, Checked, Clear or Undo", [donePatch(), checkedPatch(appr, { ref: "A301" }), clearPatch(appr), undoPatchFor(appr, donePatch())].every((p) => !("answer" in p) && !editOutrunsApproval(appr, p)));
  const real = register.items.filter((i) => i.certainty === "client_approved");
  ok(`the real job's ${real.length} client-approved records keep theirs, whoever is named`, real.length > 0 && real.every((i) => WHO_CHOICES.every((c) => { const p = setActionPatch(i, c, { what: "x" }); return !("answer" in p) && !editOutrunsApproval(i, p); })));
  const locked = L002({ sync: { locked: true } }), baselined = L002({ sync: { baselined: true } });
  ok("a contract-locked or baselined record is never parked", [locked, baselined].every((r) => !("answer" in setActionPatch(r, C("client"), { what: "x" }))));
  ok("the same choice, not approved, is parked (the rule still runs)", setActionPatch(L002(), C("client"), { what: "x" }).answer?.unresolved?.reason === "decide_later");
}

section("Closing: Done, Checked, Clear");
{
  const a = item(register, "i46");
  const done = apply(register, "i46", donePatch(a));
  ok("Done closes it, keeps it and stops it printing", item(done, "i46").resolved && openPoints(done, context).length === 8 && !architectBriefModel(done, context, {}).points.some((x) => x.ids.includes("i46")));
  ok("the pill becomes '✓ Done'", flagState(item(done, "i46")) === "done");
  ok("Undo puts it back", item(apply(done, "i46", undoPatchFor(a, donePatch(a))), "i46").resolved === false);
  const g = item(register, "i27");
  ok("Checked needs a reference", checkedPatch(g, { ref: "", by: "Sam" }) === null && checkedPatch(g, { ref: "   " }) === null);
  const ck = checkedPatch(g, { ref: "A301 Rev D detail 4", by: "Sam Morris", at: "2026-11-17T01:00:00.000Z" });
  ok("then verifies it with who, when and the reference", ck.technicalStatus === "verified" && flat(ck.technicalEvidence) === flat({ at: "2026-11-17T01:00:00.000Z", by: "Sam Morris", ref: "A301 Rev D detail 4" }));
  const checked = apply(register, "i27", ck);
  ok("which passes the existing 'verified needs a reference' rule and leaves the list", !itemIssues(item(checked, "i27")).length && !openPoints(checked, context).some((x) => x.ids.includes("i27")));
  ok("a check with an action on it closes the action too", checkedPatch({ ...g, nextAction: "Confirm half round" }, { ref: "A301" }).resolved === true && !("resolved" in ck));
  const hvac = item(register, "i08");
  const cleared = clearPatch({ ...hvac, responsibility: "architect", nextAction: "Confirm", actionDue: "next_issue" });
  ok("Clear removes who, by-when and words; the owner stays when the question has one (HVAC → trade)", cleared.responsibility === "trade" && cleared.nextAction === "" && cleared.actionDue === "" && cleared.actionRole === "" && questionById("W-020").owner === "trade");
  ok("…and with no default owner, no one", clearPatch(g).responsibility === "");
  ok("Clear reopens nothing and leaves the record's own state alone", flagState(makeItem({ ...g, ...clearPatch(g) })) === "open");
}

section("Closing the sheet saves only what was typed (M4)");
{
  const base = { itemKind: "selection", isNew: false, savedWhat: "" };
  ok("a done record opened and closed, nothing typed → nothing saved (it stays done)", whatToSaveOnClose({ ...base, state: "done", text: "Confirm half round", edited: false }) === null);
  ok("a done record with new words typed → reopened with them", flat(whatToSaveOnClose({ ...base, state: "done", text: "Confirm quad instead", edited: true })) === flat({ nextAction: "Confirm quad instead", resolved: false }));
  ok("a set record, nothing typed, the prefill differing from what's saved → nothing saved", whatToSaveOnClose({ ...base, state: "set", savedWhat: "", text: "Confirm half round", edited: false }) === null);
  ok("a set record whose words are unchanged → nothing saved", whatToSaveOnClose({ ...base, state: "set", savedWhat: "Confirm it", text: "  Confirm it ", edited: true }) === null);
  ok("a new follow-up with typed words keeps them as its own", flat(whatToSaveOnClose({ state: "none", itemKind: "action", isNew: true, savedWhat: "", text: "Check the stair", edited: true })) === flat({ description: "Check the stair", nextAction: "Check the stair" }));
  ok("words typed before anyone is named wait under 'No one named yet'", flat(whatToSaveOnClose({ ...base, state: "open", text: "Check the fall", edited: true })) === flat({ nextAction: "Check the fall", resolved: false }));
  ok("…and the untouched prefill doesn't", whatToSaveOnClose({ ...base, state: "open", text: "Confirm half round", edited: false }) === null);
  ok("an emptied box saves nothing", whatToSaveOnClose({ ...base, state: "set", savedWhat: "x", text: "  ", edited: true }) === null);
  // An action closed with the old PromptRow "Done" box: its words are in description, nextAction empty.
  const oldDone = makeItem({ ...item(register, "i46"), resolved: true, nextAction: "" });
  ok("the real case: an old 'Done' action viewed and closed stays done", flagState(oldDone) === "done"
    && whatToSaveOnClose({ state: flagState(oldDone), itemKind: oldDone.itemKind, isNew: false, savedWhat: oldDone.nextAction, text: prefillWhat(register, oldDone), edited: false }) === null);
}

section("Naming who keeps what was already typed (M5)");
{
  const typed = makeItem({ ...item(register, "i27"), nextAction: "Check fall over the kitchen extension with the engineer", actionDue: "2026-12-04" });
  const p = assignPatch(register, typed, C("architect"));
  ok("words and by-when already typed stay", p.nextAction === "Check fall over the kitchen extension with the engineer" && p.actionDue === "2026-12-04" && p.responsibility === "architect", flat(p));
  const blank = assignPatch(register, item(register, "i27"), C("architect"));
  ok("a blank record still gets the prefill and the default by-when", blank.nextAction === "Confirm half round" && blank.actionDue === "next_issue");
  ok("a by-when chosen in the sheet wins", assignPatch(register, typed, C("client"), { due: "next_meeting" }).actionDue === "next_meeting");
  ok("Undo puts the record back as it was", flat(undoPatchFor(typed, p)) === flat({ responsibility: "", actionRole: "", nextAction: typed.nextAction, actionDue: "2026-12-04", resolved: false }), flat(undoPatchFor(typed, p)));
}

section("The ⚑'s states");
ok("outline grey: nothing needed", flagState(item(register, "i28")) === "none" && flagState(null) === "none");
ok("outline amber: open but no one asked (a check, a choice not decided, an element in or out)", ["i27", "i61", "i71", "i06"].every((id) => flagState(item(register, id)) === "open"));
ok("set → pill; resolved → done", flagState(makeItem({ nextAction: "x" })) === "set" && flagState(makeItem({ actionDue: "next_meeting" })) === "set" && flagState(makeItem({ resolved: true, nextAction: "x" })) === "done");
ok("no one named yet reads so on the pill", pillWords(context, makeItem({ nextAction: "x", actionDue: "2026-11-28" })) === "No one named · 28 Nov");
ok("a past date is overdue", isOverdue("2026-11-16", "2026-11-17") && !isOverdue("2026-11-17", "2026-11-17") && !isOverdue("next_issue", "2026-11-17"));
ok("footnote by who (the client brief's heading is “Decisions to make”)", footnoteFor(item(register, "i27"), "architect") === "Prints in the architect's brief under “Needed for the next drawing issue”."
  && footnoteFor(item(register, "i29"), "client") === "Prints in the client's brief under “Decisions to make”.");
// Owner decision D3: the architect's 03 leaves responsibility "blue_leaf" out. The client brief (its design is locked)
// still lists Blue Leaf's decisions under "Decisions to make", so the footnote says so (R16), checked against both builders.
{
  const printsFor = (id, who) => {
    const it = item(register, id);
    const reg = apply(register, id, setActionPatch(it, C(who), { what: "Decide it", due: "next_meeting" }));
    const cpb = buildRegisterFixture("client_brief", { lead: realJob().lead, context, register: reg, projectRef: "X", status: "Draft", recipientName: "C" }).clientBrief;
    return { footnote: footnoteFor(item(reg, id), who), client: cpb.decisions.some((d) => d.action === "Decide it."),
      // printed for the architect: a numbered point in 03, or an Open line in its room's row in 04
      architect: (() => { const m = architectBriefModel(reg, context, {}); return m.points.some((x) => x.ids.includes(id)) || m.roomGroups.some((g) => g.rows.some((r) => (r.open || []).some((o) => o.ids.includes(id)))); })() };
  };
  const bl = printsFor("i27", "blue_leaf");
  ok("Blue Leaf (Gutters): 'Not in the architect's brief. The client's brief lists it under “Decisions to make”.' — and both briefs agree",
    bl.footnote === FOOTNOTE_BLUE_LEAF && FOOTNOTE_BLUE_LEAF === "Not in the architect's brief. The client's brief lists it under “Decisions to make”." && !bl.architect && bl.client, flat(bl));
  ok("…even a technical check (D3)", footnoteFor(makeItem({ promptKey: "K-006", itemKind: "selection", technicalStatus: "needs_verification" }), "blue_leaf") === FOOTNOTE_BLUE_LEAF);
  const blReq = printsFor("i61", "blue_leaf");
  ok("Blue Leaf on a requirement (washer / dryer layout): our list only, and neither brief prints it", blReq.footnote === FOOTNOTE_OURS && FOOTNOTE_OURS === "Our list only — doesn't print." && !blReq.architect && !blReq.client, flat(blReq));
  const cl = printsFor("i27", "client");
  const cpbHeading = /sectionHead\("S5_NUM", "Decisions", "([^"]+)"\)/.exec(readFileSync(join(REPO_ROOT, "scripts/documents/author-cpb.mjs"), "utf8"))?.[1];
  ok("Client: the footnote names the client brief's printed heading (“Decisions to make”), and the client brief lists it",
    cpbHeading === "Decisions to make" && cl.footnote === FOOTNOTE_CLIENT && FOOTNOTE_CLIENT.includes(`“${cpbHeading}”`) && FOOTNOTE_BLUE_LEAF.includes(`“${cpbHeading}”`) && cl.client, flat({ cl, cpbHeading }));
  const clReq = printsFor("i61", "client");
  ok("Client on a requirement in a room: never a decision in the client brief, so the footnote names the room's row in the architect's brief (owner answer 17 Nov: room points print in the room's row)",
    clReq.footnote === "Prints in the architect's brief, in this room's row, with who and by when." && clReq.architect && !clReq.client, flat(clReq));
  ok("…a whole-house point still names 03", footnoteFor(item(register, "i27"), "architect") === FOOTNOTE_ARCHITECT);
  ok("no footnote for no one", footnoteFor(item(register, "i27"), null) === "" && footnoteFor(null, "blue_leaf") === FOOTNOTE_BLUE_LEAF);
}
ok("the sheet's subject line", subjectLine(register, item(register, "i27")) === "Throughout · Gutters" && subjectLine(register, item(register, "i61")) === "Laundry · Washer / dryer layout");

section("The Actions list is openPoints with every element its own row, grouped (the real job)");
{
  const next = actionPoints(register, context, "next_issue");
  const all = actionPoints(register, context, "all");
  const gNext = groupPoints(next), gAll = groupPoints(all);
  ok("the list is openPoints with merge off", ids(next) === ids(openPoints(register, context, { scope: "next_issue", merge: false })) && ids(all) === ids(openPoints(register, context, { scope: "all", merge: false })));
  ok("Next drawing issue: 10; Everything open: 12 (spec S4)", next.length === 10 && all.length === 12, `${next.length} / ${all.length}`);
  ok("the groups, flattened, are the list exactly (same points, same order)", ids(gNext.flatMap((g) => g.points)) === ids(next) && ids(gAll.flatMap((g) => g.points)) === ids(all));
  ok("Architect 2 · Energy assessor 1 · Client 2 · No one named yet 5", flat(gNext.map((g) => [g.label, g.points.length])) === flat([["Architect", 2], ["Energy assessor", 1], ["Client", 2], ["No one named yet", 5]]), flat(gNext.map((g) => [g.label, g.points.length])));
  ok("the client's held action is in the list, flagged", gNext.find((g) => g.key === "client").points.some((p) => p.ids[0] === "i46" && p.held === "no_ask"));
  ok("everything open adds the bedroom floor and the splashback", ids(all).split(",").filter((x) => !ids(next).split(",").includes(x)).sort().join() === "i29,i39");
  ok("the header pill: exactly { count: 10, unnamed: 5 }", flat(actionsSummary(register, context)) === flat({ count: 10, unnamed: 5 }), flat(actionsSummary(register, context)));
  ok("…the count is the next-issue points, unnamed those with no one named", actionsSummary(register, context).count === next.length && actionsSummary(register, context).unnamed === next.filter((p) => p.who.key === UNNAMED_GROUP).length);
  ok("where the list opens: next issue, everything, or the next-issue list at 'No one named yet'",
    flat(openingView("next_issue")) === flat({ filter: "next_issue", focusGroup: null }) && flat(openingView("all")) === flat({ filter: "all", focusGroup: null })
    && flat(openingView("unnamed")) === flat({ filter: "next_issue", focusGroup: "none" }) && flat(openingView(undefined)) === flat({ filter: "next_issue", focusGroup: null }));
  ok("a row with nothing asked yet opens the sheet; the others open the record", rowOpensSheet(next.find((p) => p.ids[0] === "i06")) && !rowOpensSheet(next.find((p) => p.ids[0] === "i27")) && !rowOpensSheet(next.find((p) => p.ids[0] === "i46")));
  ok("Retaining and Pool are their own rows, each with its own who", pointSubject(next.find((p) => p.ids.includes("i71"))) === "Retaining" && pointSubject(next.find((p) => p.ids.includes("i72"))) === "Pool"
    && next.filter((p) => p.ids.includes("i71") || p.ids.includes("i72")).every((p) => p.ids.length === 1 && p.who.key === UNNAMED_GROUP));
  const printed = architectBriefModel(register, context, {}).points;
  ok("…while the printed 03 still asks them once: 'Retaining and pool: are they part of this job?'", printed.some((p) => p.ids.includes("i71") && p.ids.includes("i72") && /^Retaining and pool: are they part of this job\?/.test(p.text))
    && pointSubject(openPoints(register, context).find((p) => p.ids.includes("i71"))) === "Retaining and pool", flat(printed.map((p) => p.text)));
  const line = (id) => pointLine(all.find((p) => p.ids.includes(id)));
  ok("row words: nothing asked, designer to confirm, check still open, not decided, in or out",
    line("i06").text === "Nothing asked yet" && line("i06").nothingAsked && line("i38").text === "Designer to confirm" && line("i27").text === "Check still open"
    && line("i61").text === "Not decided" && line("i71").text === "In or out of this job?" && line("i29").text === "Deciding later" && line("i46").text === "Curved micro cement feature rangehood");
  const tags = (id) => pointTags(all.find((p) => p.ids.includes(id)), "2026-11-17").map((t) => t.text);
  ok("tags: say what's needed; a technical check on the client; engineered stone can't be used",
    tags("i46").includes("Say what's needed — won't print until it does") && tags("i08").includes("A technical check — usually not the client's") && tags("i38").includes("Engineered stone can't be used"));
  ok("nothing else is tagged", !tags("i27").length && !tags("i06").length);
  const r3 = apply(register, "i06", { actionDue: "next_issue" });
  ok("Copy list, plain text", copyListText(openPoints(r3, context)).split("\n")[0] === "Architect — Windows & glazing priorities (Throughout): confirm double glazed aluminium, Jolong, white frames — next drawing issue",
    copyListText(openPoints(r3, context)).split("\n")[0]);
  ok("one line a point", copyListText(next).split("\n").length === 10 && copiedWords(10) === "Copied 10 actions" && copiedWords(1) === "Copied 1 action");
  const named2 = load((j) => { j.context.consultants = [{ role: "architect", name: "Jo Bright", company: "Bright Studio", status: "active" }]; });
  ok("a named architect shows in the copied line", copyListText(openPoints(named2.register, named2.context)).startsWith("Architect (Bright Studio) — "));
  ok("an empty register: nothing waiting", groupPoints(openPoints({ meta: emptyMeta({}), items: [] }, context)).length === 0 && flat(actionsSummary(null, context)) === flat({ count: 0, unnamed: 0 }));
}

// ── Rendered (esbuild → string, no browser) ────────────────────────────────────────────────────────
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REG = join(REPO, "src/components/sales/lead-detail/register");
const dir = mkdtempSync(join(tmpdir(), "register-needs-action-"));
const out = join(REPO, "node_modules", ".cache", `register-needs-action-${process.pid}.mjs`);
const entry = join(dir, "entry.jsx");
writeFileSync(entry, `
import { renderToStaticMarkup } from "react-dom/server";
import ActionsPanel from ${JSON.stringify(join(REG, "ActionsPanel.jsx"))};
import { actionsSummary } from ${JSON.stringify(join(REG, "ActionsPanel.jsx"))};
import { NeedsActionFlag, NeedsActionProvider } from ${JSON.stringify(join(REG, "NeedsAction.jsx"))};
import PromptRow from ${JSON.stringify(join(REG, "PromptRow.jsx"))};
const noop = () => {};
export { actionsSummary };
export const panel = (props) => renderToStaticMarkup(<ActionsPanel updateItem={noop} upsertItem={noop} addItem={noop} onClose={noop} {...props} />);
export const flag = (props) => renderToStaticMarkup(<NeedsActionFlag updateItem={noop} upsertItem={noop} {...props} />);
export const row = (props, scope) => renderToStaticMarkup(scope ? <NeedsActionProvider {...scope}><PromptRow onChange={noop} {...props} /></NeedsActionProvider> : <PromptRow onChange={noop} {...props} />);
`);
try {
  await build({
    entryPoints: [entry], outfile: out, bundle: true, format: "esm", platform: "node", jsx: "automatic", logLevel: "silent",
    nodePaths: [join(REPO, "node_modules")], external: ["react", "react-dom", "react-dom/server", "react-router-dom"],
    define: { "import.meta.env": "{}" }, loader: { ".png": "empty", ".svg": "empty", ".css": "empty" },
  });
  const R = await import(pathToFileURL(out).href);
  const count = (h, re) => (h.match(re) || []).length;

  section("Rendered: the Actions list");
  const h = R.panel({ reg: register, context, initialFilter: "next_issue" });
  ok("10 rows, and the two filter counts", count(h, /data-testid="action-row-/g) === 10 && h.includes("Next drawing issue (10)") && h.includes("Everything open (12)"));
  ok("groups in print order, 'No one named yet' last", h.indexOf("Architect · 2") < h.indexOf("Energy assessor · 1") && h.indexOf("Energy assessor · 1") < h.indexOf("Client · 2") && h.indexOf("Client · 2") < h.indexOf("No one named yet · 5"));
  ok("rows with no one named carry the inline who chips (Retaining and Pool each their own)", count(h, /data-testid="assign-architect"/g) === 5 && count(h, />More…</g) === 5
    && h.includes('data-testid="action-row-i71"') && h.includes('data-testid="action-row-i72"'));
  ok("the first 'nothing asked' row says what a tap does, once", count(h, /tap to say what&#x27;s needed/g) === 1);
  ok("a technical check's ✓ asks for the reference; others mark done", h.includes("Mark checked: Gutters") && h.includes("Mark done: Outstanding whole-house decision"));
  ok("the held tag and the footer", h.includes("Say what&#x27;s needed — won&#x27;t print until it does") && h.includes("+ Needs action for the whole job") && h.includes("Copy list"));
  ok("no question codes on screen", !/\b[A-Z]-\d{3}\b/.test(h.replace(/data-testid="[^"]*"/g, "")));
  ok("Everything open shows 12", count(R.panel({ reg: register, context, initialFilter: "all" }), /data-testid="action-row-/g) === 12);
  const un = R.panel({ reg: register, context, initialFilter: "unnamed" });
  ok("'unnamed' opens the next-issue list with 'No one named yet' highlighted", count(un, /data-testid="action-row-/g) === 10 && /aria-pressed="true"[^>]*data-testid="actions-filter-next"/.test(un)
    && /data-testid="actions-group-none" data-highlight="true"/.test(un) && count(un, /data-highlight=/g) === 1);
  ok("…and the other openings highlight nothing", !/data-highlight=/.test(h) && !/data-highlight=/.test(R.panel({ reg: register, context, initialFilter: "all" })));
  ok("touch targets: the filter and Copy list are 44 px, the inline who chips have a 44 px tap area", /h-11 whitespace-nowrap px-3[^"]*"[^>]*data-testid="actions-filter-next"/.test(h) && /data-testid="assign-architect" class="[^"]*min-h-\[44px\]/.test(h));
  ok("an empty job: 'Nothing is waiting on anyone.'", R.panel({ reg: { meta: emptyMeta({}), items: [] }, context }).includes("Nothing is waiting on anyone."));
  ok("the pill's numbers come from the same import", flat(R.actionsSummary(register, context)) === flat(actionsSummary(register, context)));

  section("Rendered: the ⚑ and PromptRow");
  const grey = R.flag({ reg: register, context, item: item(register, "i28") });
  const amber = R.flag({ reg: register, context, item: item(register, "i27") });
  ok("grey when nothing is needed, amber when open", /border-hairline/.test(grey) && !/border-warning/.test(grey) && /border-warning/.test(amber));
  ok("open is said, not only coloured: its name and a dot the grey one never has", /aria-label="Needs action: open, no one asked yet. Throughout · Gutters"/.test(amber)
    && /aria-label="Needs action from… /.test(grey) && /rounded-full border border-surface bg-warning/.test(amber) && !/bg-warning/.test(grey));
  const set = apply(register, "i27", setActionPatch(item(register, "i27"), C("architect"), { what: "Confirm half round", due: "next_issue" }));
  ok("the pill once set", R.flag({ reg: set, context, item: item(set, "i27") }).includes("Architect · Next issue"));
  ok("'✓ Done' once closed", R.flag({ reg: register, context, item: makeItem({ ...item(register, "i46"), resolved: true }) }).includes("✓ Done"));
  ok("a locked record's ⚑ still opens (the sheet shows it read-only)", !/disabled=""/.test(R.flag({ reg: register, context, item: makeItem({ ...item(register, "i27"), sync: { locked: true } }) })));
  ok("a question not answered yet still has its ⚑", /Needs action from…/.test(R.flag({ reg: register, context, item: null, seed: { promptKey: "L-002", itemKind: "requirement", roomId: "ld", category: "layout" } })));
  const q = (id) => questionById(id);
  const seed = (id) => ({ itemKind: q(id).itemKind, category: q(id).category, promptKey: id, technicalStatus: q(id).technical });
  const w25 = R.row({ question: q("W-025"), item: null, seed: seed("W-025") }, { reg: register, context });
  ok("every PromptRow carries the ⚑ (reg and context from the provider)", /data-testid="needs-action-/.test(w25) && /Needs action from… Throughout · Outstanding whole-house decision/.test(w25));
  ok("an action question has no 'Not decided' or 'N/A'", !/Not decided/.test(w25) && !/>N\/A</.test(w25));
  ok("other questions keep them", /Not decided/.test(R.row({ question: q("W-001"), item: null, seed: seed("W-001") })));
  ok("an action keeps its owner and Done on the card", /owner —/.test(w25) && /Done/.test(w25));
  ok("the Register table's expanded row can leave it off", !/needs-action-/.test(R.row({ question: q("W-001"), item: makeItem(seed("W-001")), actionFlag: false })));
} catch (e) {
  fail++; console.log(`  ✗ test stopped: ${String(e.stack || e).slice(0, 800)}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
  rmSync(out, { force: true });
}

console.log(`\nregister-needs-action: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
