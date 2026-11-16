/**
 * documentProofread.mjs — Blueprint checks a draft register document's spelling and wording, and marks what it finds
 * on a copy of the draft.
 *
 *   1. The draft is built exactly as the preview builds it (same register, same fixture, same template data).
 *   2. Only the words the document prints are sent: each paragraph of the filled template (body, header and footer), in
 *      reading order, each once, so the template's own wording is checked too and nothing a hidden section would have
 *      held is sent. Not the PDF, not the register. A Client Project Brief is a few thousand tokens.
 *   3. A small model reads them (task "document_proofread": claude-haiku-5-5 at low effort by default, about a tenth
 *      of a cent a check; falls back to Haiku 4.5 — server/lib/aiModels.mjs) and returns structured findings: the exact
 *      printed words, a suggested replacement, and why.
 *   4. A finding is kept only if its words really are in the document, as whole words. Each kept finding is highlighted,
 *      with a small number, on a copy of the filled DOCX, then turned into a PDF by the same LibreOffice step.
 *
 * Nothing is changed: the wording comes from the register's records and the template, so staff fix it there and
 * preview again. The check never blocks or alters an issue, and the issued document is never marked.
 */
import Anthropic from "@anthropic-ai/sdk";
import PizZip from "pizzip";
import { aiClient, createForTask, classifyAiError, AI_ERROR_TEXT, modelsFor, anthropicApiKey } from "./aiModels.mjs";
import { convertDocxToPdfBuffer } from "./docxToPdf.mjs";
import {
  REGISTER_DOC_TYPES, DocumentError, buildRegisterFixture, fillRegisterDocx, loadInputs, nextVersion, versionsDiffer,
  registerItemVersions, isoDate,
} from "./registerDocuments.mjs";

/** About 15,000 tokens of text: far more than any register document prints today. Beyond it, the rest isn't sent. */
export const PROOF_MAX_CHARS = 60_000;
export const PROOF_MAX_ISSUES = 25;
const KINDS = ["spelling", "grammar", "punctuation", "wording", "consistency"];

const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();

const unescXml = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&amp;/g, "&");

/**
 * The words a filled DOCX prints: each paragraph's text (body, then headers and footers), in reading order, each once,
 * with letters in it. Read from the filled template, not its data, so a section the template hides is never sent and
 * the template's own wording is checked too (review PROOF-07).
 */
export function docxText(docx) {
  const zip = new PizZip(docx);
  const parts = ["word/document.xml", ...Object.keys(zip.files).filter((n) => /^word\/(header|footer)\d*\.xml$/.test(n)).sort()];
  const out = [], seen = new Set();
  for (const part of parts) {
    const xml = zip.file(part)?.asText() || "";
    for (const m of xml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)) {
      const text = norm([...m[1].matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:(tab|br)\/>/g)].map((t) => (t[2] ? " " : unescXml(t[1]))).join(""));
      if (/[A-Za-z]{2}/.test(text) && !seen.has(text)) { seen.add(text); out.push(text); }
    }
  }
  return out;
}

const WORD = /[\p{L}\p{N}]/u;
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/**
 * Every place a finding's words print, as [start, end] offsets in `text`: whole words only ("its" is not in "sits",
 * review PROOF-02), and any run of spaces in the finding matches any run of spaces on the page, so a phrase in the
 * cover's double-spaced lines is still found (fix-check CLOSE-02).
 */
export function findAll(text, needle) {
  const words = needle.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const re = new RegExp(`${WORD.test(needle.trim()[0]) ? "(?<![\\p{L}\\p{N}])" : ""}${words.map(escRe).join("\\s+")}${WORD.test(needle.trim().at(-1)) ? "(?![\\p{L}\\p{N}])" : ""}`, "gu");
  return [...text.matchAll(re)].map((m) => [m.index, m.index + m[0].length]);
}

const SYSTEM = `You proofread documents for Blue Leaf Building, a residential builder in South Australia.

Report only real problems a careful proofreader would fix:
- spelling mistakes and typos;
- grammar errors (agreement, tense, missing or doubled words);
- punctuation errors (missing or stray commas, unclosed brackets, doubled full stops);
- wording a reader would stumble on: unclear, ambiguous or awkward phrasing, a sentence that runs on or stops short, or (in a client document) office jargon and internal codes in a sentence meant for a homeowner;
- the same thing called by two different names within the document.

Do not report:
- Australian English spelling (colour, organise, metre, centre, licence as a noun): it is correct;
- building terms (make good, ensuite, scullery, robe, lean-to, alfresco, soffit, eaves, render, cladding, SWMS); in a document for staff, consultants or trades, technical terms and trade abbreviations too;
- names of people, companies, places, products or brands; addresses; dates; numbers; measurements; reference codes such as BLB-CPB-0417-R01 or P009-UAZ;
- a style preference, when the original is already correct and clear;
- anything that would change the facts or the meaning.

For each problem give:
- "text": the exact characters as printed, copied character for character: a stretch of three to eight words that contains the problem and appears only once in the document (never a single common word on its own, never more than one sentence);
- "suggestion": what to print instead of exactly that stretch;
- "reason": a few plain words saying why;
- "kind": spelling, grammar, punctuation, wording or consistency.
List the most important problems first, at most ${PROOF_MAX_ISSUES}. If there are none, return an empty list. Answer only with the JSON.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["issues"],
  properties: {
    issues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "suggestion", "reason", "kind"],
        properties: {
          text: { type: "string" }, suggestion: { type: "string" }, reason: { type: "string" },
          kind: { type: "string", enum: KINDS },
        },
      },
    },
  },
};

/** The JSON object in a model reply: the whole reply, or (if a model wrapped it in words) the outermost {...}. */
export function parseIssuesJson(text) {
  const t = String(text || "").trim();
  for (const candidate of [t, t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)]) {
    try { const j = JSON.parse(candidate); if (j && Array.isArray(j.issues)) return j.issues; } catch { /* try the next */ }
  }
  throw new DocumentError(502, "Blueprint's reply couldn't be read. Try the check again.", "PROOF_UNREADABLE");
}

/**
 * The findings worth showing: words that really are in the document, a different suggestion, no repeats, in the order
 * they appear on the page, numbered from 1.
 */
export function keepIssues(raw, strings) {
  const seen = new Set(), kept = [];
  for (const r of raw || []) {
    const text = norm(r?.text), suggestion = norm(r?.suggestion);
    if (!text || text.length > 400 || text === suggestion || seen.has(text)) continue;
    // Where it prints, as whole words: the first place ([paragraph, offset]) and how many places in all.
    let pos = null, count = 0;
    for (let p = 0; p < strings.length; p++) { const hits = findAll(strings[p], text); if (hits.length && !pos) pos = [p, hits[0][0]]; count += hits.length; }
    if (!pos) continue;
    seen.add(text);
    // Words that print in more than one place can't say which place is wrong: listed, not marked (fix-check CLOSE-01).
    kept.push({ text, suggestion, reason: norm(r?.reason).slice(0, 300), kind: KINDS.includes(r?.kind) ? r.kind : "wording", unique: count === 1, pos });
  }
  return kept.slice(0, PROOF_MAX_ISSUES).sort((a, b) => a.pos[0] - b.pos[0] || a.pos[1] - b.pos[1]).map(({ pos, ...x }, i) => ({ n: i + 1, ...x }));
}

/** Ask the model to proofread these printed strings. Returns { issues, model, truncated, usage }. */
/** Who reads the document, as the model is told (review PROOF-03: the architect's brief is not a homeowner document). */
export function readerFor(docType, layout) {
  const audience = REGISTER_DOC_TYPES[docType]?.audience;
  if (audience === "internal") return "Blue Leaf staff (an internal document)";
  if (audience === "architect") return "the architect and design consultants (a technical coordination document)";
  if (docType === "selections_schedule" && layout !== "client") return "suppliers and trades (a technical schedule)";
  return "the homeowner (a client document)";
}

export async function proofreadStrings({ client, strings, docLabel, reader }) {
  let used = 0, truncated = false;
  const lines = [];
  for (const s of strings) { if (used + s.length > PROOF_MAX_CHARS) { truncated = true; break; } lines.push(s); used += s.length + 1; }
  let response;
  try {
    response = await createForTask(client, "document_proofread", {
      max_tokens: 6000,
      system: SYSTEM,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: `Document: ${docLabel}. Reader: ${reader}.\nEach line below is one piece of text the document prints, in reading order:\n\n${lines.join("\n")}` }],
    }, { module: "documentProofread" });
  } catch (e) {
    if (e instanceof DocumentError) throw e;
    // A provider failure, in plain English (the raw provider text never reaches the browser: CLAUDE.md).
    if (e instanceof Anthropic.APIError || e?.status) { const kind = classifyAiError(e); throw new DocumentError(503, AI_ERROR_TEXT[kind], `AI_${kind.toUpperCase()}`); }
    throw e;
  }
  if (response.stop_reason === "refusal") throw new DocumentError(502, "Blueprint declined to check this document.", "PROOF_REFUSED");
  const text = (response.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  return { issues: keepIssues(parseIssuesJson(text), lines), model: response.model, truncated, usage: response.usage || null };
}

// ── Marking the draft ────────────────────────────────────────────────────────────────────────────
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const HIGHLIGHT = "<w:highlight w:val=\"yellow\"/>";
const NUMBER = "<w:color w:val=\"C0392B\"/><w:vertAlign w:val=\"superscript\"/>";
const withProps = (rPr, add, drop = []) => {
  let p = rPr || "<w:rPr></w:rPr>";
  for (const tagName of drop) p = p.replace(new RegExp(`<w:${tagName}\\b[^>]*/>`, "g"), "");
  return p.replace("</w:rPr>", `${add}</w:rPr>`);
};

/**
 * Highlight each finding's words where they print, with its number after them in small red superscript. Only words
 * inside one run of text can be marked (a phrase that crosses a field or a line break is listed but not marked).
 * Returns { docx, marked } — marked is the set of finding numbers highlighted at least once.
 */
export function highlightDocx(docx, issues) {
  const zip = new PizZip(docx);
  const marked = new Set();
  const byLength = issues.filter((i) => i.unique !== false).sort((a, b) => b.text.length - a.text.length);
  const part = "word/document.xml";
  const xml = zip.file(part)?.asText();
  if (!xml || !byLength.length) return { docx, marked };
  const out = xml.replace(/<w:r(\s[^>]*)?>([\s\S]*?)<\/w:r>/g, (run, attrs = "", inner) => {
    const rPr = (inner.match(/^\s*(<w:rPr>[\s\S]*?<\/w:rPr>)/) || [])[1] || "";
    let changed = false;
    const body = inner.replace(/<w:t(\s[^>]*)?>([^<]*)<\/w:t>/g, (whole, _a, raw) => {
      const text = unescXml(raw);
      const hits = [];
      for (const iss of byLength) {
        for (const [at, end] of findAll(text, iss.text)) if (!hits.some((h) => at < h.end && end > h.at)) hits.push({ at, end, n: iss.n });
      }
      if (!hits.length) return whole;
      changed = true;
      hits.sort((a, b) => a.at - b.at);
      const plain = (s) => (s ? `<w:r${attrs}>${rPr}<w:t xml:space="preserve">${esc(s)}</w:t></w:r>` : "");
      let pos = 0, pieces = "";
      for (const h of hits) {
        marked.add(h.n);
        pieces += plain(text.slice(pos, h.at));
        pieces += `<w:r${attrs}>${withProps(rPr, HIGHLIGHT, ["highlight"])}<w:t xml:space="preserve">${esc(text.slice(h.at, h.end))}</w:t></w:r>`;
        pieces += `<w:r${attrs}>${withProps(rPr, NUMBER, ["color", "vertAlign", "highlight"])}<w:t xml:space="preserve">${h.n}</w:t></w:r>`;
        pos = h.end;
      }
      pieces += plain(text.slice(pos));
      // Close the run around this text, put the marked runs in its place, and reopen the run for whatever follows.
      return `</w:r>${pieces}<w:r${attrs}>${rPr}`;
    });
    return changed ? `<w:r${attrs}>${body}</w:r>` : run;
  });
  zip.file(part, out);
  return { docx: zip.generate({ type: "nodebuffer", compression: "DEFLATE" }), marked };
}

/**
 * Proofread a document fixture: the filled template's words go to the model; the findings are highlighted on a copy of
 * the filled DOCX and turned into a PDF. Returns { pdf, issues: [{ n, text, suggestion, reason, kind, marked }], model,
 * truncated, usage }.
 */
export async function proofreadFixture({ client, docType, fx, layout }) {
  const spec = REGISTER_DOC_TYPES[docType];
  if (!spec) throw new DocumentError(400, "Unknown document type.", "BAD_DOC");
  const docx = fillRegisterDocx(docType, fx, { layout });
  const result = await proofreadStrings({ client, strings: docxText(docx), docLabel: spec.label, reader: readerFor(docType, layout) });
  if (!result.issues.length) return { ...result, pdf: null, issues: [] };
  const marked = highlightDocx(docx, result.issues);
  const pdf = await convertDocxToPdfBuffer(marked.docx);
  return { ...result, pdf, issues: result.issues.map((i) => ({ ...i, marked: marked.marked.has(i.n) })) };
}

/**
 * The route's entry point: the draft as the preview builds it, refused if the register changed since that preview
 * (so the marks are on the words staff are looking at).
 */
export async function proofreadDocument(sb, leadId, docType, { layout, recipientName, actor, expectedVersions, client } = {}) {
  if (!REGISTER_DOC_TYPES[docType]) throw new DocumentError(400, "Unknown document type.", "BAD_DOC");
  const { lead, register, context } = await loadInputs(sb, leadId, actor);
  if (expectedVersions && versionsDiffer(expectedVersions, registerItemVersions(register, context))) {
    throw new DocumentError(409, "The register changed since this preview. Preview the draft again, then check the wording.", "PROOF_STALE");
  }
  let revision = 1;
  try { revision = await nextVersion(sb, leadId, docType); } catch { /* the draft prints no revision before migration 213 */ }
  const fx = buildRegisterFixture(docType, { lead, context, register, revision, issuedDate: isoDate(), issuer: actor?.name, recipientName, status: "Draft" });
  const anthropic = client || defaultClient();
  return proofreadFixture({ client: anthropic, docType, fx, layout });
}

let _client = null;
function defaultClient() {
  if (_client) return _client;
  const key = anthropicApiKey();
  if (!key) throw new DocumentError(503, AI_ERROR_TEXT.auth, "AI_AUTH");
  _client = aiClient();
  return _client;
}

/** For the UI and /health: the model a check uses now. */
export const proofreadModel = () => modelsFor("document_proofread").primary;
