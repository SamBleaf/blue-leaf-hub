/**
 * document-proofread.test.mjs — Blueprint's wording check of a draft register document (server/lib/documentProofread.mjs):
 * what is sent (only the printed words), which model, which findings are kept, and the highlighted copy of the draft
 * rendered through the real pipeline (DOCX → LibreOffice). A fake Anthropic client: no network, no key.
 *
 *   node scripts/tests/document-proofread.test.mjs
 */
import fs from "fs";
import path from "path";
import os from "os";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import PizZip from "pizzip";
import Anthropic from "@anthropic-ai/sdk";
// Set before the server modules load (static imports are hoisted, so these are dynamic): a local .env can't change the models.
for (const k of ["DOC_PROOFREAD_MODEL", "DOC_PROOFREAD_FALLBACK_MODEL", "AI_FALLBACK_MODEL"]) delete process.env[k];
process.env.AI_MODELS_IGNORE_DOTENV = "1";
process.env.AI_CALL_LOG_DISABLED = "1";
const { docxText, keepIssues, parseIssuesJson, highlightDocx, proofreadFixture, readerFor, findAll, PROOF_MAX_CHARS } = await import("../../server/lib/documentProofread.mjs");
const { _resetAiModelState } = await import("../../server/lib/aiModels.mjs");
const { DOC_DEFS } = await import("../../server/lib/documents/documentPayloads.mjs");
const { renderRegisterDocument, fillRegisterDocx } = await import("../../server/lib/registerDocuments.mjs");

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail ? `\n    ${String(detail).slice(0, 500)}` : ""}`); } };
const section = (t) => console.log(`\n${t}`);
const here = path.dirname(fileURLToPath(import.meta.url));
const load = (f) => JSON.parse(fs.readFileSync(path.join(here, "../documents/fixtures", f), "utf8"));
const apiError = (status, type, message) => Anthropic.APIError.generate(status, { type: "error", error: { type, message } }, message, {});

/** A fixture with one planted typo: the first " the " in the client brief's text becomes " teh ". */
function withTypo(fx) {
  const copy = JSON.parse(JSON.stringify(fx));
  let done = false;
  const walk = (o) => { for (const k of Object.keys(o)) { if (done) return; const v = o[k];
    if (typeof v === "string" && / the /.test(v)) { o[k] = v.replace(" the ", " teh "); done = true; } else if (v && typeof v === "object") walk(v); } };
  walk(copy.clientBrief);
  if (!done) throw new Error("no ' the ' to plant a typo in");
  return copy;
}
const reno = withTypo(load("reno-extension.json"));
const strings = docxText(fillRegisterDocx("client_brief", reno));
const payloadStrings = (pl) => { const out = []; const walk = (n) => { if (typeof n === "string") out.push(n.replace(/\s+/g, " ").trim()); else if (n && typeof n === "object") Object.values(n).forEach(walk); }; walk(pl); return out; };

/** A fake client that answers with `issues` (or throws per model). Records each request. */
function fakeClient(issues, script = {}) {
  const calls = [];
  return { calls, messages: { create: async (params) => {
    calls.push(params);
    if (script[params.model] instanceof Error) throw script[params.model];
    if (script[params.model] === "refusal") return { model: params.model, content: [], stop_reason: "refusal", usage: {} };
    return { model: params.model, content: [{ type: "text", text: JSON.stringify({ issues }) }], stop_reason: "end_turn", usage: { input_tokens: 2000, output_tokens: 300 } };
  } } };
}

section("What is sent: only the words the document prints");
ok("the words are the filled template's paragraphs, each once, in reading order (body, header, footer)", strings.length > 20 && new Set(strings).size === strings.length && strings.some((s) => / teh /.test(s)), strings.length);
ok("…no empty, numeric-only or punctuation-only strings", strings.every((s) => /[A-Za-z]{2}/.test(s)));
const cbPayload = payloadStrings(DOC_DEFS.client_brief.build(reno));
ok("…the template's own wording is checked too (paragraphs that aren't in the data)", strings.some((s) => !cbPayload.some((p) => p && s.includes(p))), strings.slice(0, 5).join(" | "));
{
  const plain = load("reno-extension.json");
  const archWords = docxText(fillRegisterDocx("architect_brief", plain)), archData = payloadStrings(DOC_DEFS.architect_brief.build(plain));
  const hidden = archData.filter((d) => d.length > 25 && /[a-z]{4}/.test(d) && !archWords.some((w) => w.includes(d)));
  ok("…and a section the template hides is never sent (review PROOF-07: the architect brief's short reference list)", hidden.length > 0 && hidden.every((h) => !archWords.join(" ").includes(h)), hidden.slice(0, 3).join(" | "));
}
ok("each document names its real reader (review PROOF-03)", /homeowner/.test(readerFor("client_brief")) && /architect/.test(readerFor("architect_brief")) && /suppliers and trades/.test(readerFor("selections_schedule", "technical"))
  && /homeowner/.test(readerFor("selections_schedule", "client")) && /staff/.test(readerFor("tender_scope_notes")));

section("Which findings are kept");
const raw = [
  { text: "teh", suggestion: "the", reason: "Typo.", kind: "spelling" },
  { text: "words that are nowhere in the document", suggestion: "x", reason: "Invented.", kind: "wording" },
  { text: "teh", suggestion: "the", reason: "Duplicate.", kind: "spelling" },
  { text: strings[0].split(" ").slice(0, 3).join(" "), suggestion: strings[0].split(" ").slice(0, 3).join(" "), reason: "No change.", kind: "wording" },
  { text: strings[1].split(" ").slice(0, 2).join(" "), suggestion: "Something else", reason: "Earlier on the page.", kind: "odd-kind" },
];
const kept = keepIssues(raw, strings);
ok("words not in the document, repeats and 'suggestions' identical to the original are dropped", kept.length === 2 && kept.every((k) => k.text !== "words that are nowhere in the document"), JSON.stringify(kept));
ok("…the rest are numbered in page order, and an unknown kind reads as wording", kept[0].n === 1 && kept[1].n === 2 && kept.find((k) => k.text === "teh").n === 2 && kept[0].kind === "wording", JSON.stringify(kept));
ok("a finding counts only as whole words: 'its' inside 'sits' is not a finding; a real 'its' is (review PROOF-02)",
  keepIssues([{ text: "its", suggestion: "it's", reason: "x", kind: "grammar" }], ["The cottage sits quietly."]).length === 0
  && keepIssues([{ text: "its", suggestion: "it's", reason: "x", kind: "grammar" }], ["The cottage sits in its garden."]).length === 1);
{
  const k = keepIssues([{ text: "in its garden", suggestion: "in it's garden", reason: "x", kind: "grammar" }, { text: "the shed", suggestion: "a shed", reason: "x", kind: "wording" }],
    ["The cottage sits in its garden by the shed.", "Paint the shed."]);
  ok("words that print in more than one place are listed but not marked (we can't tell which place); words that print once are marked (fix-check CLOSE-01)",
    k.find((i) => i.text === "in its garden").unique === true && k.find((i) => i.text === "the shed").unique === false, JSON.stringify(k));
}
ok("a phrase in a double-spaced line is still found, and a space in the finding matches a run of spaces (fix-check CLOSE-02)",
  findAll("Client Project Brief  /  Design Study", "Client Project Brief / Design Study").length === 1 && findAll("price $5 each", "$5").length === 1);
ok("the reply is read as JSON, also when a model wraps it in words; nonsense is a clear error", parseIssuesJson('{"issues":[]}').length === 0 && parseIssuesJson('Here you go: {"issues":[{"text":"a"}]} done').length === 1
  && (() => { try { parseIssuesJson("no json here"); return false; } catch (e) { return e.code === "PROOF_UNREADABLE"; } })());

section("Marking the draft");
{
  const xml = '<w:document><w:body><w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Hello wrold &amp; friends</w:t></w:r><w:r><w:t>split</w:t></w:r><w:r><w:t> phrase</w:t></w:r></w:p></w:body></w:document>';
  const zip = new PizZip(); zip.file("word/document.xml", xml);
  const { docx, marked } = highlightDocx(zip.generate({ type: "nodebuffer" }), [{ n: 1, text: "wrold & friends" }, { n: 2, text: "split phrase" }]);
  const out = new PizZip(docx).file("word/document.xml").asText();
  ok("a finding inside one run is highlighted, keeps its formatting, and gets its number", marked.has(1) && /<w:rPr><w:b\/><w:highlight w:val="yellow"\/><\/w:rPr><w:t xml:space="preserve">wrold &amp; friends<\/w:t>/.test(out)
    && /<w:vertAlign w:val="superscript"\/><\/w:rPr><w:t xml:space="preserve">1<\/w:t>/.test(out) && /Hello /.test(out), out);
  ok("…a phrase that crosses two runs is listed but not marked, and the rest of the text is untouched", !marked.has(2) && /<w:t>split<\/w:t>/.test(out) && /<w:t> phrase<\/w:t>/.test(out));
  ok("…every run stays well formed (balanced <w:r> tags)", (out.match(/<w:r>|<w:r\s/g) || []).length === (out.match(/<\/w:r>/g) || []).length);
  const z2 = new PizZip(); z2.file("word/document.xml", '<w:document><w:body><w:p><w:r><w:t xml:space="preserve">The cottage sits in its garden, together with their shed.</w:t></w:r></w:p></w:body></w:document>');
  const h2 = new PizZip(highlightDocx(z2.generate({ type: "nodebuffer" }), [{ n: 1, text: "its" }, { n: 2, text: "the" }]).docx).file("word/document.xml").asText();
  const z3 = new PizZip(); z3.file("word/document.xml", '<w:document><w:body><w:p><w:r><w:t xml:space="preserve">Client Project Brief  /  Design Study</w:t></w:r></w:p><w:p><w:r><w:t>Paint the shed and the shed door.</w:t></w:r></w:p></w:body></w:document>');
  const h3 = highlightDocx(z3.generate({ type: "nodebuffer" }), [{ n: 1, text: "Client Project Brief / Design Study", unique: true }, { n: 2, text: "the shed", unique: false }]);
  ok("…a double-spaced phrase is marked; a repeated one is not", h3.marked.has(1) && !h3.marked.has(2) && (new PizZip(h3.docx).file("word/document.xml").asText().match(/<w:highlight/g) || []).length === 1);
  ok("…only whole words are marked: 'its' but not the 'its' in 'sits'; no 'the' inside 'together' or 'their' (review PROOF-02)",
    (h2.match(/<w:highlight/g) || []).length === 1 && /sits in <\/w:t>/.test(h2) && /together with their shed/.test(h2), h2);
}

section("End to end through the real renderer (fake model)");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "proof-test-"));
_resetAiModelState();
{
  const client = fakeClient([{ text: "teh", suggestion: "the", reason: "Typo.", kind: "spelling" }, { text: "not printed anywhere at all", suggestion: "x", reason: "?", kind: "wording" }]);
  const out = await proofreadFixture({ client, docType: "client_brief", fx: reno });
  const req = client.calls[0];
  ok("one request, to the proofreading model, at low effort, with a JSON schema for the answer", client.calls.length === 1 && req.model === "claude-haiku-5-5" && req.output_config?.effort === "low" && req.output_config?.format?.type === "json_schema", JSON.stringify({ model: req.model, oc: req.output_config }));
  const sent = req.messages[0].content.split("\n").slice(3);
  ok("…the message carries only printed words (every line is one of them), and the rules are Australian English", sent.length === strings.length && sent.every((l) => strings.includes(l)) && /Australian English/.test(req.system), `${sent.length} vs ${strings.length}`);
  ok("…and says who reads it", /Reader: the homeowner/.test(req.messages[0].content));
  ok("…the findings come back numbered, the invented one dropped, and marked on the page", out.issues.length === 1 && out.issues[0].n === 1 && out.issues[0].marked === true && out.model === "claude-haiku-5-5", JSON.stringify(out.issues));
  const pdf = path.join(tmp, "proof.pdf"); fs.writeFileSync(pdf, out.pdf);
  const plainPdf = path.join(tmp, "plain.pdf"); fs.writeFileSync(plainPdf, (await renderRegisterDocument("client_brief", reno, {})).pdf);
  let text = "", pages = 0, plainPages = 0;
  try { text = execFileSync("pdftotext", [pdf, "-"], { encoding: "utf8" }); pages = Number(execFileSync("pdfinfo", [pdf], { encoding: "utf8" }).match(/Pages:\s+(\d+)/)[1]); plainPages = Number(execFileSync("pdfinfo", [plainPdf], { encoding: "utf8" }).match(/Pages:\s+(\d+)/)[1]); } catch { /* poppler missing */ }
  ok("the highlighted copy renders through LibreOffice, shows the number after the words, and keeps the page count", /teh\s?1/.test(text) && pages > 0 && pages === plainPages, `pages ${pages} vs ${plainPages}`);
}
_resetAiModelState();
{
  const client = fakeClient([], {});
  const out = await proofreadFixture({ client, docType: "client_brief", fx: reno });
  ok("no findings: nothing to mark, so no second render", out.issues.length === 0 && out.pdf === null);
}

section("When the model can't help");
_resetAiModelState();
{
  const client = fakeClient([{ text: "teh", suggestion: "the", reason: "Typo.", kind: "spelling" }], { "claude-haiku-5-5": apiError(404, "not_found_error", "model: claude-haiku-5-5") });
  const out = await proofreadFixture({ client, docType: "client_brief", fx: reno });
  ok("a refused model falls back to Haiku 4.5 with the same request (format kept, effort dropped)", out.model === "claude-haiku-4-5-20251001" && client.calls.length === 2
    && client.calls[1].output_config?.format && !("effort" in client.calls[1].output_config), JSON.stringify(client.calls[1].output_config));
}
_resetAiModelState();
{
  const client = fakeClient([], { "claude-haiku-5-5": apiError(429, "rate_limit_error", "rate_limit_error: secret internal detail") });
  let e = null; try { await proofreadFixture({ client, docType: "client_brief", fx: reno }); } catch (x) { e = x; }
  ok("a provider error becomes a plain-English message with a status; the provider's text never reaches the browser", e?.status === 503 && e.code === "AI_RATE_LIMIT" && /rate limit/i.test(e.message) && !/secret internal detail/.test(e.message), e?.message);
}
_resetAiModelState();
{
  const client = fakeClient([], { "claude-haiku-5-5": "refusal", "claude-haiku-4-5-20251001": "refusal" });
  let e = null; try { await proofreadFixture({ client, docType: "client_brief", fx: reno }); } catch (x) { e = x; }
  ok("a refusal is said plainly (after the fallback model declined too)", e?.code === "PROOF_REFUSED" && client.calls.length === 2, client.calls.map((c) => c.model).join());
}
_resetAiModelState();
{
  const client = fakeClient([], { "claude-haiku-5-5": "refusal" });
  let e = null, r = null; try { r = await proofreadFixture({ client, docType: "client_brief", fx: reno }); } catch (x) { e = x; }
  ok("…a request one model declines is checked once more on the fallback model", !e && !!r && client.calls.map((c) => c.model).join() === "claude-haiku-5-5,claude-haiku-4-5-20251001", e?.message || client.calls.map((c) => c.model).join());
}
_resetAiModelState();
{
  const big = JSON.parse(JSON.stringify(reno)); big.clientBrief.overview = Array.from({ length: 200 }, (_, i) => `Paragraph ${i} ${"word ".repeat(80)}`);
  const client = fakeClient([]);
  const out = await proofreadFixture({ client, docType: "client_brief", fx: big });
  ok("a document longer than the limit is checked up to the limit, and says so (never silently cut)", out.truncated === true && client.calls[0].messages[0].content.length <= PROOF_MAX_CHARS + 500);
}

console.log(`\ndocument-proofread: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
