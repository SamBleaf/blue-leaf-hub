/**
 * sales-lead-detail-render.test.mjs — renders the recomposed Sales lead-page pieces to a string and reads the page
 * source for the "only one of these" rules (R05 P2). Needs no browser, server or database. It proves what each piece
 * offers in each state. It does not click anything: effects don't run, so loaded data is passed in where it can be.
 *
 * Run: node scripts/tests/sales-lead-detail-render.test.mjs
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { gateRows } from "../../src/lib/stageGates.js";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const dir = mkdtempSync(join(tmpdir(), "lead-render-"));
const out = join(REPO, "node_modules", ".cache", `lead-render-${process.pid}.mjs`);
const entry = join(dir, "entry.jsx");
const C = (n) => JSON.stringify(join(REPO, "src/components/sales/lead-detail", `${n}.jsx`));
writeFileSync(entry, `
import { renderToStaticMarkup as r } from "react-dom/server";
import LeadStageAdvance from ${C("LeadStageAdvance")};
import EnquiryCallScript from ${C("EnquiryCallScript")};
import LeadSummaryPanel from ${C("LeadSummaryPanel")};
import LeadMailbox from ${C("LeadMailbox")};
import LeadCorrespondence from ${C("LeadCorrespondence")};
import StageEmailButton from ${C("StageEmailButton")};
import QualifyActions from ${C("QualifyActions")};
import DiscoveryActions from ${C("DiscoveryActions")};
import LeadDetailHeader from ${C("LeadDetailHeader")};
import LeadStageSection from ${C("LeadStageSection")};
const noop = () => {};
export const advance = (p) => r(<LeadStageAdvance onAdvance={noop} {...p} />);
export const enquiry = (lead) => r(<EnquiryCallScript lead={lead} patch={noop} scorecard={null} />);
export const summary = (lead) => r(<LeadSummaryPanel lead={lead} />);
export const mailbox = (p) => r(<LeadMailbox lead={{ id: "l1" }} {...p} />);
export const correspondence = (lead) => r(<LeadCorrespondence lead={lead} patch={noop} reload={noop} />);
export const emailButton = (p) => r(<StageEmailButton lead={{ id: "l1" }} endpoint="qualify-email" label="Review qualify email" {...p} />);
export const qualify = (lead) => r(<QualifyActions lead={lead} patch={noop} reload={noop} />);
export const discovery = (lead) => r(<DiscoveryActions lead={lead} reload={noop} />);
export const header = (primaryAction) => r(<LeadDetailHeader breadcrumb={null} stepper={null} keyFacts={null} secondaryActions={null} primaryAction={primaryAction} />);
export const section = () => r(<LeadStageSection title="Notes"><p>inside</p></LeadStageSection>);
`);

await build({
  entryPoints: [entry], outfile: out, bundle: true, format: "esm", platform: "node", jsx: "automatic", logLevel: "silent",
  nodePaths: [join(REPO, "node_modules")], external: ["react", "react-dom", "react-dom/server", "react-router-dom"],
  define: { "import.meta.env": "{}" }, loader: { ".png": "empty", ".svg": "empty", ".css": "empty" },
});

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${String(e.message).slice(0, 300)}`); }
}
const count = (s, re) => (s.match(re) || []).length;

try {
  const v = await import(pathToFileURL(out).href);

  console.log("\n▸ The stage-completion panel");
  const toDiscovery = (lead) => gateRows("discovery", lead);
  const blocked = v.advance({ nextLabel: "Discovery", gates: toDiscovery({ qualify_score: 3, discovery_meeting_booked_at: null }), canAdvance: false, blockedNote: "Finish the items above to move on." });
  t("says what is required", () => { assert.match(blocked, />Required</); assert.match(blocked, /won.{1,8}t allow this move/); });
  t("a stage with no advisory items shows no Recommended group", () => assert.doesNotMatch(blocked, />Recommended</));
  t("the button is off when the gate isn't met", () => assert.match(blocked, /<button[^>]* disabled=""[^>]*>Move to Discovery →/));
  t("failed rows don't look passed", () => { assert.equal(count(blocked, /✗/g), 2); assert.doesNotMatch(blocked, /✓/); });
  t("tells staff how to fix it", () => assert.match(blocked, /Score the qualifying questions/));
  t("it is the pointer's landing spot", () => assert.match(blocked, /data-next-target="stage-advance"/));

  const concept = gateRows("winning_offer", { concept_agreement_status: "accepted" });
  const advisory = v.advance({ nextLabel: "Concept", gates: concept, canAdvance: concept.allMet, blockedNote: "x" });
  t("recommended is labelled separately from required", () => { assert.match(advisory, />Required</); assert.match(advisory, />Recommended</); });
  t("says plainly that the button waits for recommended items", () => assert.match(advisory, /This button waits for these too/));
  t("says who can skip them, where, and that it's logged", () => assert.match(advisory, /A Director can skip them with Move ▾ on the pipeline board, and the skip is logged/));
  t("advisory misses are not shown as hard failures", () => { assert.equal(count(advisory, />!</g), 3); assert.equal(count(advisory, /✗/g), 0); });
  t("the button still waits (D4 unchanged)", () => assert.match(advisory, /<button[^>]* disabled=""[^>]*>Move to Concept →/));

  const ready = gateRows("discovery", { qualify_score: 6, discovery_meeting_booked_at: "2026-11-01" });
  const open = v.advance({ nextLabel: "Discovery", gates: ready, canAdvance: ready.allMet, blockedNote: "Finish the items above to move on." });
  t("all met: the button is live and the nag is gone", () => { assert.doesNotMatch(open, /disabled=""/); assert.doesNotMatch(open, /Finish the items/); });
  t("while moving it can't be pressed twice", () => assert.match(v.advance({ nextLabel: "Discovery", gates: ready, canAdvance: true, advancing: true }), /<button[^>]* disabled=""[^>]*>Moving…/));

  console.log("\n▸ Enquiry");
  const enq = v.enquiry({ id: "l1", stage: "enquiry" });
  t("no Proceed button", () => assert.doesNotMatch(enq, /Proceed to Qualify/));
  t("no second Nurture or Lost button", () => { assert.doesNotMatch(enq, /→ Nurture/); assert.doesNotMatch(enq, /Mark Lost/); });
  t("the call script is still there", () => assert.match(enq, /Enquiry call/));

  console.log("\n▸ Reference rail");
  t("no qualifying score in Key details", () => assert.doesNotMatch(v.summary({ id: "l1", qualify_score: 6 }), /\/8|Qualifying/));
  t("sections are closed by default", () => { const s = v.section(); assert.doesNotMatch(s, /<details[^>]* open/); assert.match(s, />Notes</); });

  console.log("\n▸ The mailbox is on demand");
  const msgs = [{ id: "1", direction: "outbound", subject: "Hello", body: "Body", sentAt: "2026-11-03T02:00:00Z", messageId: "<a@x>" }];
  const mb = v.mailbox({ messages: msgs });
  t("no blank composer until asked for", () => { assert.doesNotMatch(mb, /placeholder="Subject"/); assert.doesNotMatch(mb, /<textarea/); assert.match(mb, />New message</); });
  t("says sent isn't delivered", () => assert.match(mb, /can.{1,8}t see whether it was delivered or read/));
  const off = v.mailbox({ messages: msgs, sendingOff: true });
  t("sending off: says so and offers no way to send", () => { assert.match(off, /turned off/); assert.doesNotMatch(off, />New message</); assert.doesNotMatch(off, />Reply</); });
  t("history still shows when sending is off", () => assert.match(off, /Hello/));

  console.log("\n▸ The stage email button");
  t("opening it is the only control until asked", () => { const b = v.emailButton({}); assert.match(b, />Review qualify email</); assert.doesNotMatch(b, /<textarea/); });
  t("shows why it can't be opened", () => { const b = v.emailButton({ disabledReason: "Select a designer above before sending the discovery email." }); assert.match(b, /Select a designer/); assert.match(b, /<button[^>]* disabled=""/); });

  console.log("\n▸ Client correspondence, first paint");
  const cor = v.correspondence({ id: "l1", stage: "qualify" });
  t("one review control, no composer", () => { assert.match(cor, /Review qualify email/); assert.doesNotMatch(cor, /<textarea/); assert.doesNotMatch(cor, /placeholder="Subject"/); });
  t("doesn't claim an empty history before it has loaded", () => { assert.match(cor, /Loading…/); assert.doesNotMatch(cor, /No emails recorded/); });
  t("the thread starts closed", () => assert.match(cor, /aria-expanded="false"/));
  const enqCor = v.correspondence({ id: "l1", stage: "enquiry" });
  t("enquiry offers no template and says why", () => { assert.doesNotMatch(enqCor, /Review/); assert.match(enqCor, /normally a call/); });
  const cons = v.correspondence({ id: "l1", stage: "consultants" });
  t("consultants defer to the per-consultant threads", () => assert.match(cons, /each consultant/));
  const tender = v.correspondence({ id: "l1", stage: "tender" });
  t("several emails share one picker and one button", () => { assert.equal(count(tender, /<select/g), 1); assert.equal(count(tender, />Review email</g), 1); assert.equal(count(tender, /<option/g), 5); });

  console.log("\n▸ Qualify panel");
  const q = v.qualify({ id: "l1", stage: "qualify", qualify_score: 3 });
  t("no send control of its own", () => { assert.doesNotMatch(q, /Preview &amp; send/); assert.doesNotMatch(q, />Send email</); });
  t("still offers both routes to a build conversation", () => { assert.match(q, /Go to the qualify email/); assert.match(q, /already held \(no email\)/); });
  t("doesn't repeat the score", () => assert.doesNotMatch(q, /\/8/));
  t("the pointer's landing spot is the conversation itself", () => assert.match(q, /data-next-target="discovery_meeting_booked_at"/));
  const held = v.qualify({ id: "l1", stage: "qualify", discovery_meeting_booked_at: "2026-11-01", discovery_meeting_source: "manual" });
  t("a logged call doesn't claim a booking", () => { assert.match(held, /logged as already held/); assert.doesNotMatch(held, /conversation booked/); });
  const sent = v.qualify({ id: "l1", stage: "qualify", qualify_intro_sent_at: "2026-11-01T02:00:00Z" });
  t("after the email: says recorded as sent, offers the booking check", () => { assert.match(sent, /recorded as sent/); assert.match(sent, /Check for booking/); });

  console.log("\n▸ Discovery panel");
  const d = v.discovery({ id: "l1", stage: "discovery" });
  t("no send control of its own", () => assert.doesNotMatch(d, /discovery email/i));
  t("the concept agreement stays", () => assert.match(d, /Concept agreement/));

  console.log("\n▸ Header");
  const h = v.header({ label: "Next: Upload the signed PTSA", onClick: () => {} });
  t("shows the one pointer", () => assert.equal(count(h, /<button/g), 1));
  t("nothing to point at, no button", () => assert.equal(count(v.header(null), /<button/g), 0));

  console.log("\n▸ Page source: only one of each");
  const read = (p) => readFileSync(join(REPO, p), "utf8");
  const page = read("src/pages/LeadDetail.jsx");
  const dirPath = "src/components/sales/lead-detail";
  const files = readdirSync(join(REPO, dirPath)).filter((f) => f.endsWith(".jsx"));
  t("StageEmailBox is gone", () => { assert.equal(existsSync(join(REPO, dirPath, "StageEmailBox.jsx")), false); assert.doesNotMatch(page, /StageEmailBox/); });
  t("the advance handler has one caller on the page", () => assert.equal(count(page, /advanceStage/g), 2));
  t("the header and sticky bar can only point", () => { assert.match(page, /primaryAction = nextAction \? \{ label: `Next: \$\{nextAction\.label\}`, onClick: goToNextAction \} : null/); assert.equal(count(page, /primaryAction =/g), 1); });
  t("the advance block isn't in the rail or the Action tab any more", () => assert.doesNotMatch(page, /nextActionEl/));
  t("LeadCorrespondence is mounted once per layout, in the focus card", () => assert.equal(count(page, /<LeadCorrespondence /g), 1));
  t("the page doesn't mount the mailbox directly", () => assert.doesNotMatch(page, /<LeadMailbox /));
  t("only StageEmailButton posts to a stage email endpoint", () => {
    for (const f of files) if (f !== "StageEmailButton.jsx") assert.doesNotMatch(read(`${dirPath}/${f}`), /(qualify|discovery|concept|tender|pipeline)-email\/send|<StageEmailButton(?![^>]*key=\{selected)/, f);
  });
  t("only LeadCorrespondence renders StageEmailButton", () => {
    assert.match(read(`${dirPath}/LeadCorrespondence.jsx`), /<StageEmailButton/);
    assert.doesNotMatch(page, /StageEmailButton/);
  });
  t("the score isn't in the header facts", () => assert.doesNotMatch(page, /uppercase tracking-wide text-muted">Qualifying</));
  t("the score is written in exactly two guarded places", () => {
    assert.equal(count(page, /qualify_score \?\? 0\}\/8/g), 2);
    assert.match(page, /\{scorecardInFocus && \(\s*<span[^\n]*\n\s*\{lead\.qualify_score \?\? 0\}\/8/);
  });
  t("the rail is narrower", () => assert.match(read(`${dirPath}/LeadCommandCentreLayout.jsx`), /_300px\]/));
  t("Blueprint no longer calls the AI on every page load", () => assert.match(page, /if \(lead && bpWanted\) fetchBlueprintInsight\(lead\)/));
} finally {
  rmSync(dir, { recursive: true, force: true });
  rmSync(out, { force: true });
}

console.log(`\n${fail ? "FAILED" : "PASSED"}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
